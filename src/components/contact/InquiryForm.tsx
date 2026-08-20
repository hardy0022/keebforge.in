"use client";

import Link from "next/link";
import { useActionState } from "react";
import { sendInquiry, type InquiryState } from "@/app/actions/inquiry";

export function InquiryForm() {
  const [state, formAction, pending] = useActionState<InquiryState, FormData>(sendInquiry, {});

  if (state.ok) {
    return (
      <div className="card text-center">
        <div className="text-[2rem]" aria-hidden="true">✅</div>
        <h3 className="ct">Inquiry Sent</h3>
        <p className="cd" style={{ marginBottom: 20 }}>
          Thanks — your repair inquiry is on its way. KeebForge will get back to you with a quote.
        </p>
        <Link href="/" className="btn-prime">
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="card">
      <h3 className="ct">Send a Repair Inquiry</h3>
      <p className="cd" style={{ marginBottom: 20 }}>
        Describe your device and issue — we&apos;ll get back to you with a quote.
      </p>

      <div className="form-row">
        <label htmlFor="iq-name">Name</label>
        <input id="iq-name" name="name" type="text" placeholder="Your full name" required autoComplete="name" />
      </div>
      <div className="form-row">
        <label htmlFor="iq-phone">WhatsApp / Phone Number</label>
        <input id="iq-phone" name="phone" type="tel" placeholder="+91 9998888000" required autoComplete="tel" pattern="[0-9+\-\s()]{10,20}" />
      </div>
      <div className="form-row">
        <label htmlFor="iq-email">Email</label>
        <input id="iq-email" name="email" type="email" placeholder="your@email.com" required autoComplete="email" />
      </div>
      <div className="form-row">
        <label htmlFor="iq-device">Keyboard / Device Model</label>
        <input id="iq-device" name="deviceModel" type="text" placeholder="e.g. Keychron K2, Logitech G Pro…" required />
      </div>
      <div className="form-row">
        <label htmlFor="iq-issue">Issue Description</label>
        <textarea
          id="iq-issue"
          name="issue"
          placeholder="Describe the problem in detail — what's happening, when it started, any damage visible…"
          required
          minLength={20}
        />
      </div>

      {state.error && (
        <p role="alert" className="text-[0.82rem] text-red-400 mb-3">
          {state.error}
        </p>
      )}

      <button type="submit" className="btn-form-submit" disabled={pending}>
        {pending ? "Sending…" : "Send Inquiry"}
      </button>
    </form>
  );
}