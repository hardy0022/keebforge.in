"use server";

import { Resend } from "resend";
import { z } from "zod";
import { cloudinaryConfigured, uploadBuffer } from "@/lib/cloudinary";

const inquirySchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name.").max(80),
  phone: z
    .string()
    .trim()
    .min(10, "Please enter a valid phone number.")
    .max(20)
    .regex(/^[0-9+\-\s()]+$/, "Only digits, +, - and spaces are allowed."),
  email: z.string().trim().email("Please enter a valid email address.").max(120),
  deviceModel: z.string().trim().min(2, "Please enter the device model.").max(120),
  issue: z.string().trim().min(20, "Please describe the issue in a little more detail.").max(2000),
});

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type InquiryState = { ok?: boolean; error?: string };

function sniffImageType(buf: Buffer): "jpeg" | "png" | "webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  )
    return "png";
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP")
    return "webp";
  return null;
}

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

  for (const f of rawImages) {
    if (!ALLOWED_IMAGE_TYPES.has(f.type)) {
      return { error: `Only JPG, PNG and WEBP images are supported ("${f.name}" isn't one of those).` };
    }
    if (f.size > MAX_IMAGE_BYTES) {
      return { error: `Each photo must be under 5 MB — "${f.name}" is too large.` };
    }
  }

  const uploaded: { url: string; publicId: string }[] = [];
  if (rawImages.length > 0) {
    if (!cloudinaryConfigured()) {
      return {
        error:
          "Photo upload is temporarily unavailable. You can still send the inquiry without photos, or email the photos to contact@keebforge.in.",
      };
    }
    for (const f of rawImages) {
      const buf = Buffer.from(await f.arrayBuffer());
      if (!sniffImageType(buf)) {
        return { error: `"${f.name}" isn't a valid image. Only JPG, PNG and WEBP are accepted.` };
      }
      try {
        const r = await uploadBuffer(buf, "keebforge/repairs");
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
      subject: `Repair Inquiry — ${deviceModel} — ${name}`,
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