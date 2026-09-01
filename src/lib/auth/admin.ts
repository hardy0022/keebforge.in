import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Profile, Role, User } from "@prisma/client";
import { auth } from "@/lib/auth/better-auth";
import { canAction } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

/**
 * Server-side admin authorization, backed by Profile.role OR
 * organization membership with role "developer".
 */
export type AdminContext = {
  user: Pick<User, "id" | "name" | "email">;
  profile: Pick<Profile, "id" | "role">;
};

const PROFILE_ADMIN_ROLES: Role[] = ["ADMIN", "STAFF", "DEVELOPER"];

const ORG_ADMIN_ROLES = ["owner", "developer"];

async function hasOrgAdminRole(userId: string): Promise<boolean> {
  const member = await prisma.member.findFirst({
    where: { userId, role: { in: ORG_ADMIN_ROLES } },
    select: { id: true },
  });
  return !!member;
}

function profileHasAdminRole(profile: { role: Role } | null): profile is { role: Role } & { role: "ADMIN" | "STAFF" | "DEVELOPER" } {
  return !!profile && PROFILE_ADMIN_ROLES.includes(profile.role);
}

/** Resolves the signed-in user's admin context, or null. Cached per request. */
export const getAdminContext = cache(async (): Promise<AdminContext | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, role: true },
  });

  if (profileHasAdminRole(profile)) return { user: session.user, profile };

  if (await hasOrgAdminRole(session.user.id)) {
    return { user: session.user, profile: { ...profile!, role: "ADMIN" as Role } };
  }

  return null;
});

/** Permission test against the user's Profile.role. */
export function checkAction(role: Role, resource: string, action: string): boolean {
  return canAction(role, resource, action);
}

/** Page/action guard: unauthenticated → login; non-admin → /unauthorized. */
export async function requireAdminContext(): Promise<AdminContext> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/auth/login");

  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, role: true },
  });

  if (profileHasAdminRole(profile)) return { user: session.user, profile };

  if (await hasOrgAdminRole(session.user.id)) {
    return { user: session.user, profile: { ...profile!, role: "ADMIN" as Role } };
  }

  redirect("/unauthorized");
}

/** Guard requiring a specific permission; insufficient role lands on /unauthorized. */
export async function requirePermission(resource: string, action: string): Promise<AdminContext> {
  const ctx = await requireAdminContext();
  if (!canAction(ctx.profile.role, resource, action)) redirect("/unauthorized");
  return ctx;
}
