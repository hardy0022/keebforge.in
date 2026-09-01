import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Profile, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth/better-auth";
import { requireAdminContext, type AdminContext } from "@/lib/auth/admin";

/**
 * Returns the signed-in user + profile, or null. Server-only.
 * A profile row is created on first sign-in with the explicit role CUSTOMER.
 * NEVER auto-provisions ADMIN — admin access is granted explicitly.
 */
export async function getCurrentAuth() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user ?? null;
  if (!user) return { user: null, profile: null };

  let profile = await prisma.profile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    // Claim-by-email: a profile seeded before this user existed is linked to
    // the identity that controls that email. Only the email owner can claim it.
    profile = await prisma.profile.findUnique({ where: { email: user.email } });
    if (profile) {
      profile = await prisma.profile.update({
        where: { id: profile.id },
        data: { userId: user.id, email: user.email },
      });
    } else {
      profile = await prisma.profile.create({
        data: {
          userId: user.id,
          email: user.email,
          name: user.name ?? user.email?.split("@")[0] ?? null,
          role: "CUSTOMER",
        },
      });
    }
  }
  return { user, profile };
}

export type CurrentAuth = Awaited<ReturnType<typeof getCurrentAuth>>;

/** Server-side guard for customer pages. Redirects to /login when signed out. */
export async function requireUser(): Promise<{ user: Exclude<CurrentAuth["user"], null>; profile: Profile }> {
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

/** @legacy — Profile-role helper kept for display/redirect heuristics only. NOT an authorization check. */
export function isAdminRole(role: Role) {
  return role === "ADMIN" || role === "STAFF" || role === "DEVELOPER";
}
