import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Profile } from "@prisma/client";
import { auth } from "@/lib/auth/better-auth";
import { getOrCreateProfileFromUser } from "@/lib/auth/profile";
import { requireAdminContext, type AdminContext } from "@/lib/auth/admin";

/**
 * Returns the signed-in user + profile, or null. Server-only.
 * A profile row is created on first sign-in with the explicit role CUSTOMER.
 * NEVER auto-provisions ADMIN — admin access is granted explicitly.
 * Cached per request so layout + page + actions share one session lookup.
 */
export const getCurrentAuth = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user ?? null;
  if (!user) return { user: null, profile: null };

  const profile = await getOrCreateProfileFromUser(user);
  return { user, profile };
});

export type CurrentAuth = Awaited<ReturnType<typeof getCurrentAuth>>;

/** Server-side guard for customer pages. Redirects to /login when signed out. */
export async function requireUser(): Promise<{
  user: Exclude<CurrentAuth["user"], null>;
  profile: Profile;
}> {
  const auth = await getCurrentAuth();
  if (!auth.user) redirect("/auth/login");
  return { user: auth.user, profile: auth.profile! };
}

/**
 * Server-side guard for admin pages/actions.
 * Authorization = Profile.role is ADMIN or STAFF.
 */
export async function requireAdmin(): Promise<AdminContext> {
  return requireAdminContext();
}
