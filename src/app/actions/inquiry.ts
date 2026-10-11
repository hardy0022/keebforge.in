"use server";

import { Resend } from "resend";
import { z } from "zod";
import { cloudinaryConfigured, uploadBuffer } from "@/lib/images/cloudinary";
import {
  BOUNDED_IMAGE_TYPES_MESSAGE,
  isNonEmptyFile,
  sniffBoundedImageType,
} from "@/lib/images/validation";
import { MAX_IMAGE_DIM, readImageDimensions } from "@/lib/images/read-dimensions";
import {
  actionRateLimited,
  RATE_LIMIT_ACTION_MESSAGE,
} from "@/lib/rate-limit/action";
import {
  MAX_DEVICE_MODEL,
  MAX_EMAIL,
  MAX_IMAGE_BYTES,
  MAX_INQUIRY_TOTAL_IMAGE_BYTES,
} from "@/lib/utils/limits";
import {
  logSuppressedDelivery,
  resolveOutboundRecipient,
} from "@/lib/email/outbound";
import { contactInquiryEmail, readTemplateIds } from "@/lib/email/templates";
import { resendErrorDiagnostic } from "@/lib/notifications/resend-diagnostics";
import {
  PREVIEW_OPERATION_DISABLED_MESSAGE,
  previewOperationsAllowed,
} from "@/lib/config/deployment";

const inquirySchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name.").max(80),
  phone: z
    .string()
    .trim()
    .min(10, "Please enter a valid phone number.")
    .max(20)
    .regex(/^[0-9+\-\s()]+$/, "Only digits, +, - and spaces are allowed."),
  email: z
    .string()
    .trim()
    .email("Please enter a valid email address.")
    .max(MAX_EMAIL),
  deviceModel: z.string().trim().max(MAX_DEVICE_MODEL).default(""),
  issue: z
    .string()
    .trim()
    .min(20, "Please describe the issue in a little more detail.")
    .max(2000),
});

const MAX_IMAGES = 5;

/** Per account-less submission, per hour — the form is guest-reachable. */
const RATE_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 };

export type InquiryState = { ok?: boolean; error?: string };

export async function sendInquiry(
  _prev: InquiryState,
  formData: FormData,
): Promise<InquiryState> {
  // Preview isolation (G1): this guest-reachable action writes to the shared
  // Cloudinary account and sends mail through the shared Resend account. It has
  // no database access, so the database guard cannot cover it — refuse the whole
  // action in Preview before any rate limit or work.
  if (!previewOperationsAllowed()) {
    return { error: PREVIEW_OPERATION_DISABLED_MESSAGE };
  }

  if (await actionRateLimited("inquiry", RATE_LIMIT)) {
    return { error: RATE_LIMIT_ACTION_MESSAGE };
  }

  const parsed = inquirySchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    deviceModel: formData.get("deviceModel"),
    issue: formData.get("issue"),
  });

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Please check your details and try again.",
    };
  }

  const { name, phone, email, deviceModel, issue } = parsed.data;

  const rawImages = formData.getAll("images").filter(isNonEmptyFile);
  if (rawImages.length > MAX_IMAGES) {
    return { error: `You can attach at most ${MAX_IMAGES} photos.` };
  }
  // Validate by file bytes, not browser-reported MIME — server-action form
  // serialization often turns gallery picks into generic "blob" files with a
  // lost MIME type while the bytes are valid JPEG/PNG. Same path as reviews.
  const images = await Promise.all(
    rawImages.map(async (f) => ({
      name: f.name,
      buffer: Buffer.from(await f.arrayBuffer()),
    })),
  );
  let totalBytes = 0;
  for (const img of images) {
    if (img.buffer.length > MAX_IMAGE_BYTES)
      return {
        error: `Each photo must be under 5 MB — "${img.name}" is too large.`,
      };
    totalBytes += img.buffer.length;
    if (totalBytes > MAX_INQUIRY_TOTAL_IMAGE_BYTES)
      return {
        error: "Total photo size must stay under 20 MB.",
      };
    if (!sniffBoundedImageType(img.buffer))
      return {
        error: `"${img.name}" isn't a valid image. ${BOUNDED_IMAGE_TYPES_MESSAGE}`,
      };
    const dims = readImageDimensions(img.buffer);
    if (dims && (dims.width > MAX_IMAGE_DIM || dims.height > MAX_IMAGE_DIM)) {
      return {
        error: `"${img.name}" is too large (images must be under ${MAX_IMAGE_DIM}px on each side).`,
      };
    }
  }

  const uploaded: { url: string; publicId: string }[] = [];
  if (images.length > 0) {
    if (!cloudinaryConfigured()) {
      return {
        error:
          "Photo upload is temporarily unavailable. You can still send the inquiry without photos, or email the photos to contact@keebforge.in.",
      };
    }
    for (const img of images) {
      try {
        const r = await uploadBuffer(img.buffer, {
          folder: "keebforge/repairs/inquiries",
        });
        uploaded.push({ url: r.url, publicId: r.publicId });
      } catch (e) {
        console.error("Cloudinary upload error:", e);
        return {
          error:
            "One or more photos failed to upload. Please retry, or send the inquiry without photos.",
        };
      }
    }
  }

  try {
    // Test/suppression policy: redirect or skip. Suppression is intentional, so
    // the inquiry still reports success rather than a misleading send failure.
    const plan = resolveOutboundRecipient("contact@keebforge.in");
    if (plan.action === "skip") {
      logSuppressedDelivery(plan.reason);
      return { ok: true };
    }
    const resend = new Resend(process.env.RESEND_API_KEY);
    // The admin recipient (the shared contact inbox), the reply-to behaviour and
    // the escaping all stay here; a configured template only renders the body.
    const mail = contactInquiryEmail(
      {
        name,
        phone,
        email: email,
        deviceModel,
        issue,
        photoUrls: uploaded.map((u) => u.url),
      },
      readTemplateIds().contactInquiry,
    );
    const from = process.env.EMAIL_FROM ?? "KeebForge <onboarding@resend.dev>";
    const { error } = mail.template
      ? await resend.emails.send({
          from,
          to: [plan.to],
          replyTo: email,
          subject: mail.subject,
          template: mail.template,
        })
      : await resend.emails.send({
          from,
          to: [plan.to],
          replyTo: email,
          subject: mail.subject,
          html: mail.html,
        });
    if (error) {
      // The `{ error }` payload can echo the message (recipient, inquiry text),
      // so only the sanitized diagnostic is logged.
      console.error(
        "Resend error (inquiry):",
        resendErrorDiagnostic(error),
      );
      return {
        error:
          "The inquiry could not be sent right now. Please email contact@keebforge.in directly.",
      };
    }
  } catch (e) {
    console.error("Resend error (inquiry):", resendErrorDiagnostic(e));
    return {
      error:
        "The inquiry could not be sent right now. Please email contact@keebforge.in directly.",
    };
  }

  return { ok: true };
}
