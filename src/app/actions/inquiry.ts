"use server";

import { Resend } from "resend";
import { z } from "zod";

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