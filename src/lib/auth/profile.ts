import type { Profile } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Resolve the Profile for a signed-in/verified Better Auth user.
 * Reused by the account session and the post-verification claim hook so both
 * paths provision ONE profile — find by userId, else link the email-seeded
 * profile (claim-by-email), else create with role CUSTOMER. NEVER ADMIN.
 */
export async function getOrCreateProfileFromUser(user: {
  id: string;
  email: string;
  name?: string | null;
}): Promise<Profile> {
  let profile = await prisma.profile.findUnique({ where: { userId: user.id } });
  if (profile) return profile;

  profile = await prisma.profile.findUnique({ where: { email: user.email } });
  if (profile) {
    return prisma.profile.update({
      where: { id: profile.id },
      data: { userId: user.id, email: user.email },
    });
  }
  return prisma.profile.create({
    data: {
      userId: user.id,
      email: user.email,
      name: user.name ?? user.email?.split("@")[0] ?? null,
      role: "CUSTOMER",
    },
  });
}