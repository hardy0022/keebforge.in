import { redirect } from "next/navigation";

/**
 * Email reset links point at /reset-password/<token>. This is a thin relay to
 * Better Auth's GET /api/auth/reset-password/:token, which validates the token
 * and 307s back to the callbackURL with a fresh ?token= (or ?error=INVALID_TOKEN).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const callbackURL =
    new URL(req.url).searchParams.get("callbackURL") ?? "/reset-password";
  redirect(
    `/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent(callbackURL)}`,
  );
}
