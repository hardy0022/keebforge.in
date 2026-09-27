/**
 * Phone numbers are stored and validated as exactly 10 digits (no +91, no
 * spaces, no dashes) across Profile, Address and customer checkout. These are
 * the native constraint attributes for a phone <input> — spread them on so
 * every phone field behaves identically instead of each form inventing its
 * own rule:
 *
 *   <input type="tel" placeholder="9876543210" {...PHONE_INPUT} … />
 *
 * `maxLength` caps typing/paste at 10 chars; `pattern` makes the browser
 * reject anything non-numeric. Same approach as AddressBook, now shared.
 */
export const PHONE_INPUT = {
  inputMode: "numeric",
  pattern: "[0-9]{10}",
  maxLength: 10,
  title: "Enter a 10-digit phone number",
} as const;

/** Server-side twin of PHONE_INPUT for zod/refine checks. */
export const PHONE_RE = /^\d{10}$/;
