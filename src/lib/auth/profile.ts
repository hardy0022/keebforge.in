import type { Profile } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { claimGuestOrdersForVerifiedProfile } from "@/lib/orders/claim-guest-orders";

/**
 * Resolve the Profile for a signed-in/verified Better Auth user.
 * Reused by the account session and the post-verification claim hook so both
 * paths provision ONE profile — find by userId, else link the email-seeded
 * profile (claim-by-email), else create with role CUSTOMER. NEVER ADMIN.
 *
 * Once a profile is resolved, any guest order placed under the same address is
 * claimed. `emailVerification.requireEmailVerification` is deliberately OFF, so
 * an account can exist for a long time before its address is ever verified.
 * Claiming only from `afterEmailVerification` therefore left those orders
 * orphaned until the user chose to click a verification mail. Attaching here
 * instead means the claim happens the first time an authenticated request
 * resolves this profile, verification click or not.
 *
 * Ordering matters: the profile must exist before its id can be stamped onto
 * the orders, so every return path above funnels through the claim.
 */
export async function getOrCreateProfileFromUser(user: {
  id: string;
  email: string;
  name?: string | null;
}): Promise<Profile> {
  const profile = await resolveProfile(user);
  await claimGuestOrdersForProfile(profile, user.email);
  return profile;
}

async function resolveProfile(user: {
  id: string;
  email: string;
  name?: string | null;
}): Promise<Profile> {
  const byUser = await prisma.profile.findUnique({ where: { userId: user.id } });
  if (byUser) return byUser;

  const byEmail = await prisma.profile.findUnique({ where: { email: user.email } });
  if (byEmail) {
    return prisma.profile.update({
      where: { id: byEmail.id },
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

/**
 * Attach this profile's unowned guest orders. Never throws: resolving a session
 * must not fail because a maintenance UPDATE did, so a database problem here
 * degrades to "order stays unowned" and is retried on the next request rather
 * than locking the customer out of their own account.
 */
async function claimGuestOrdersForProfile(
  profile: Profile,
  email: string | null | undefined,
): Promise<void> {
  if (!email) return;
  try {
    const claimed = await claimGuestOrdersForVerifiedProfile(profile.id, email);
    if (claimed > 0) {
      console.log(`[auth] linked ${claimed} guest order(s) to ${email}`);
    }
  } catch (e) {
    console.error("Failed to link guest orders on sign-in:", e);
  }
}