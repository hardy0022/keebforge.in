"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { sendInquiry, type InquiryState } from "@/app/actions/inquiry";

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGES = 5;
const MAX_BYTES = 5 * 1024 * 1024;

export function InquiryForm() {
  const [state, formAction, pending] = useActionState<InquiryState, FormData>(sendInquiry, {});
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<File[]>([]);
  const [imgError, setImgError] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);

  const setFiles = (files: File[]) => {
    if (inputRef.current) {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      inputRef.current.files = dt.files;
    }
    setImages(files);
  };

  const handleFiles = (incoming: File[]) => {
    setImgError(null);
    const existing = Array.from(inputRef.current?.files ?? []);
    const seen = new Set(existing.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
    const merged = [...existing];
    let err: string | null = null;
    for (const f of incoming) {
      const key = `${f.name}:${f.size}:${f.lastModified}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!ACCEPT.includes(f.type)) {
        err = err ?? `"${f.name}" isn't a supported image. Use JPG, PNG or WEBP.`;
        continue;
      }
      if (f.size > MAX_BYTES) {
        err = err ?? `"${f.name}" is over 5 MB. Compress it and try again.`;
        continue;
      }
      merged.push(f);
    }
    if (merged.length > MAX_IMAGES) {
      setFiles(merged.slice(0, MAX_IMAGES));
      setImgError(`You can attach up to ${MAX_IMAGES} photos — extra files were skipped.`);
    } else {
      setFiles(merged);
      setImgError(err);
    }
  };

  const removeImage = (idx: number) => {
    const current = Array.from(inputRef.current?.files ?? []);
    setFiles(current.filter((_, i) => i !== idx));
  };

  if (state.ok) {
    return (
      <div className="card text-center">
        <div className="text-[2rem]" aria-hidden="true">✅</div>
        <h3 className="ct">Inquiry Sent</h3>
        <p className="cd" style={{ marginBottom: 20 }}>
          Thanks — your repair inquiry is on its way. KeebForge will get back to you with a quote.
          {images.length > 0 && " We've received your photos too."}
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

      <div className="form-row">
        <label htmlFor="iq-images">Photos of the Issue</label>
        <p className="upload-hint">
          Upload clear photos of the device, damage, PCB, or affected area. Photos help us understand the issue
          before we receive the device.
        </p>
        <label
          className={`upload-zone${dropping ? " dropping" : ""}${pending ? " disabled" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDropping(true);
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDropping(false);
            if (!pending) handleFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <input
            ref={inputRef}
            id="iq-images"
            name="images"
            type="file"
            accept={ACCEPT.join(",")}
            multiple
            className="upload-input"
            disabled={pending}
            onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
          />
          <span className="upload-ico" aria-hidden="true">🖼️</span>
          <span className="upload-title">Upload photos</span>
          <span className="upload-sub">Drag &amp; drop images here</span>
          <span className="upload-sub">PNG, JPG, JPEG, WEBP · Up to {MAX_IMAGES} images</span>
        </label>
        {imgError && (
          <p role="alert" className="upload-error">
            {imgError}
          </p>
        )}
        {images.length > 0 && (
          <div className="upload-previews" role="list" aria-label="Selected photos">
            {images.map((f, i) => (
              <figure className="upload-thumb" role="listitem" key={`${f.name}:${f.size}:${i}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- blob previews can't use next/image */}
                <img src={URL.createObjectURL(f)} alt={`Photo ${i + 1}: ${f.name}`} />
                <button
                  type="button"
                  className="upload-remove"
                  onClick={() => removeImage(i)}
                  aria-label={`Remove image ${i + 1}`}
                >
                  ×
                </button>
              </figure>
            ))}
          </div>
        )}
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