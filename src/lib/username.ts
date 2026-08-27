/** Client-safe username rules shared by the register form and API routes. */
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;

export function usernameError(value: string): string | null {
  if (!USERNAME_PATTERN.test(value)) {
    return "3–24 characters; letters, numbers and underscores only.";
  }
  return null;
}
