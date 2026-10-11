"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { sendInquiry, type InquiryState } from "@/app/actions/inquiry";
import { sniffBoundedImageFile } from "@/lib/images/validation";
import { PHONE_INPUT } from "@/lib/utils/phone";
import { EMAIL_INPUT } from "@/lib/utils/email";
import { Field } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGES = 5;
const MAX_BYTES = 5 * 1024 * 1024;

export function InquiryForm() {
  const [state, formAction, pending] = useActionState<InquiryState, FormData>(
    sendInquiry,
    {},
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const issueRef = useRef<HTMLTextAreaElement>(null);
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

  const handleFiles = async (incoming: File[]) => {
    setImgError(null);
    const existing = Array.from(inputRef.current?.files ?? []);
    const seen = new Set(
      existing.map((f) => `${f.name}:${f.size}:${f.lastModified}`),
    );
    const merged = [...existing];
    let err: string | null = null;
    for (const f of incoming) {
      const key = `${f.name}:${f.size}:${f.lastModified}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (f.size > MAX_BYTES) {
        err = err ?? `"${f.name}" is over 5 MB. Compress it and try again.`;
        continue;
      }
      // Gallery/camera picks may report an empty or generic MIME type — sniff the bytes.
      if (!(await sniffBoundedImageFile(f))) {
        err =
          err ??
          `"${f.name}" isn't a supported image. Use JPG, PNG or WebP.`;
        continue;
      }
      merged.push(f);
    }
    if (merged.length > MAX_IMAGES) {
      setFiles(merged.slice(0, MAX_IMAGES));
      setImgError(
        `You can attach up to ${MAX_IMAGES} photos — extra files were skipped.`,
      );
    } else {
      setFiles(merged);
      setImgError(err);
    }
  };

  const autoGrowIssue = () => {
    const el = issueRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const removeImage = (idx: number) => {
    const current = Array.from(inputRef.current?.files ?? []);
    setFiles(current.filter((_, i) => i !== idx));
  };

  if (state.ok) {
    return (
      <Panel tag="Inquiry Sent" className="panel">
        <div className="contact-success">
          <div className="ri-done-badge" aria-hidden="true">
            ✓
          </div>
          <h2 className="ri-done-title">Inquiry Sent</h2>
          <p className="ri-done-text">
            Thanks — your repair inquiry is on its way. KeebForge will get back
            to you with a quote.
            {images.length > 0 && " We've received your photos too."}
          </p>
          <Link href="/" className="btn-prime">
            Back to Home
          </Link>
        </div>
      </Panel>
    );
  }

  return (
    <form action={formAction}>
      <Panel tag="Repair Inquiry" title="Send a Repair Inquiry" className="panel">
        <div className="field-stack">
          <Field label="Name" htmlFor="iq-name">
            <input
              id="iq-name"
              name="name"
              type="text"
              placeholder="Your full name"
              required
              autoComplete="name"
            />
          </Field>
          <Field label="WhatsApp / Phone Number" htmlFor="iq-phone">
            <input
              id="iq-phone"
              name="phone"
              type="tel"
              placeholder="9876543210"
              required
              autoComplete="tel"
              {...PHONE_INPUT}
            />
          </Field>
          <Field label="Email" htmlFor="iq-email">
            <input
              id="iq-email"
              name="email"
              type="email"
              placeholder="your@email.com"
              required
              autoComplete="email"
              {...EMAIL_INPUT}
            />
          </Field>
          <Field label="Keyboard / Device Model (optional)" htmlFor="iq-device">
            <input
              id="iq-device"
              name="deviceModel"
              type="text"
              placeholder="e.g. Keychron K2, Logitech G Pro…"
            />
          </Field>
          <Field label="Issue Description" htmlFor="iq-issue">
            <textarea
              ref={issueRef}
              id="iq-issue"
              name="issue"
              className="contact-issue"
              placeholder="Describe the problem in detail — what's happening, when it started, any damage visible…"
              required
              minLength={20}
              onInput={autoGrowIssue}
            />
          </Field>
          <Field label="Photos of the Issue (optional)">
            <div className="upload-field">
              <p className="upload-hint">
                Upload clear photos of the device, damage, PCB, or affected
                area. Photos help us understand the issue before we receive the
                device.
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
                  onChange={(e) =>
                    handleFiles(Array.from(e.target.files ?? []))
                  }
                />
                <span className="upload-ico" aria-hidden="true">
                  🖼️
                </span>
                <span className="upload-title">Upload photos</span>
                <span className="upload-sub">Drag &amp; drop images here</span>
                <span className="upload-sub">
                  PNG, JPG, JPEG, WEBP · Up to {MAX_IMAGES} images
                </span>
              </label>
              {imgError && (
                <p role="alert" className="upload-error">
                  {imgError}
                </p>
              )}
              {images.length > 0 && (
                <div
                  className="upload-previews"
                  role="list"
                  aria-label="Selected photos"
                >
                  {images.map((f, i) => (
                    <figure
                      className="upload-thumb"
                      role="listitem"
                      key={`${f.name}:${f.size}:${i}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- blob previews can't use next/image */}
                      <img
                        src={URL.createObjectURL(f)}
                        alt={`Photo ${i + 1}: ${f.name}`}
                      />
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
          </Field>
        </div>

        {state.error && (
          <p role="alert" className="ri-error">
            {state.error}
          </p>
        )}

        <button type="submit" className="btn-form-submit" disabled={pending}>
          {pending ? "Sending…" : "Send Inquiry"}
        </button>
      </Panel>
    </form>
  );
}
