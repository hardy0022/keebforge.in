/**
 * Email is stored and validated as a single `@` with a dotted TLD. Spread the
 * constraint attributes onto any email <input> so every form agrees:
 *
 *   <input type="email" placeholder="you@example.com" {...EMAIL_INPUT} … />
 *
 * Deliberately permissive about the local part (dots, `+tags`, `!#$%&` are all
 * legal) and strict only about the mistakes that actually happen: missing `@`,
 * spaces, doubled `@`, and a missing/1-char TLD. `maxLength` is RFC 5321's
 * 254-octet ceiling. The mobile attrs stop iOS capitalising and spellchecking
 * the domain, which silently corrupts addresses on real devices.
 */
export const EMAIL_INPUT = {
  inputMode: "email",
  pattern: "[^@\\s]+@[^@\\s]+\\.[^@\\s]{2,}",
  maxLength: 254,
  title: "Enter a valid email address",
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: false,
} as const;

/** Server-side twin of EMAIL_INPUT for zod/refine checks. */
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
