"use server";

import { Resend } from "resend";
import { z } from "zod";
import { cloudinaryConfigured, uploadBuffer } from "@/lib/cloudinary";
import { IMAGE_TYPES_MESSAGE, sniffImageType } from "@/lib/image-validation";

const inquirySchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name.").max(80),
  phone: z
    .string()
    .trim()
    .min(10, "Please enter a valid phone number.")
    .max(20)
    .regex(/^[0-9+\-\s()]+$/, "Only digits, +, - and spaces are allowed."),
  email: z.string().trim().email("Please enter a valid email address.").max(120),
  deviceModel: z.string().trim().max(120).default(""),
  issue: z.string().trim().min(20, "Please describe the issue in a little more detail.").max(2000),
});

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type InquiryState = { ok?: boolean; error?: string };

export async function sendInquiry(_prev: InquiryState, formData: FormData): Promise<InquiryState> {
  const parsed = inquirySchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    deviceModel: formData.get("deviceModel"),
    issue: formData.get("issue"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your details and try again." };
  }

  const { name, phone, email, deviceModel, issue } = parsed.data;

  const rawImages = formData.getAll("images").filter((f): f is File => f instanceof File);
  if (rawImages.length > MAX_IMAGES) {
    return { error: `You can attach at most ${MAX_IMAGES} photos.` };
  }
  // Validate by file bytes, not browser-reported MIME — server-action form
  // serialization often turns gallery picks into generic "blob" files with a
  // lost MIME type while the bytes are valid JPEG/PNG. Same path as reviews.
  const images = await Promise.all(
    rawImages.map(async (f) => ({ name: f.name, buffer: Buffer.from(await f.arrayBuffer()) })),
  );
  for (const img of images) {
    if (img.buffer.length > MAX_IMAGE_BYTES)
      return { error: `Each photo must be under 5 MB — "${img.name}" is too large.` };
    if (!sniffImageType(img.buffer))
      return { error: `"${img.name}" isn't a valid image. ${IMAGE_TYPES_MESSAGE}` };
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
        const r = await uploadBuffer(img.buffer, { folder: "keebforge/repairs/inquiries" });
        uploaded.push({ url: r.url, publicId: r.publicId });
      } catch (e) {
        console.error("Cloudinary upload error:", e);
        return { error: "One or more photos failed to upload. Please retry, or send the inquiry without photos." };
      }
    }
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "KeebForge <onboarding@resend.dev>",
      to: ["contact@keebforge.in"],
      replyTo: email,
      subject: `Repair Inquiry — ${deviceModel || "Device"} — ${name}`,
      html: `
        <h2>Repair Inquiry — KeebForge.in</h2>
        <table cellpadding="6" style="font-family:sans-serif;font-size:14px;color:#1a1a1a">
          <tr><td><strong>Name</strong></td><td>${esc(name)}</td></tr>
          <tr><td><strong>Phone</strong></td><td>${esc(phone)}</td></tr>
          <tr><td><strong>Email</strong></td><td>${esc(email)}</td></tr>
          <tr><td><strong>Device / Model</strong></td><td>${esc(deviceModel)}</td></tr>
          <tr><td><strong>Issue</strong></td><td>${esc(issue)}</td></tr>
        </table>
        ${
          uploaded.length > 0
            ? `<h3>Photos (${uploaded.length})</h3>` +
              uploaded.map((u) => `<p><a href="${esc(u.url)}">${esc(u.url)}</a></p>`).join("")
            : ""
        }
        <p style="color:#888">Reply to this inquiry by clicking Reply — it goes straight back to the customer.</p>
      `,
    });
    if (error) {
      console.error("Resend send error:", error);
      return { error: "The inquiry could not be sent right now. Please email contact@keebforge.in directly." };
    }
  } catch (e) {
    console.error("Resend error:", e);
    return { error: "The inquiry could not be sent right now. Please email contact@keebforge.in directly." };
  }

  return { ok: true };
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}