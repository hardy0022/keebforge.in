/**
 * Client-safe password policy — the single source of truth for the register
 * checklist UI AND the server-side enforcement (auth before-hook). Keep both
 * honest by construction.
 */
export const PASSWORD_RULES = [
  { label: "8+ characters", test: (p: string) => p.length >= 8 },
  { label: "Uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "Number", test: (p: string) => /[0-9]/.test(p) },
  { label: "Special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

export function isStrongPassword(p: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(p));
}
