import { prisma } from "@/lib/db/prisma";

/**
 * Link unowned guest orders to a profile once the user proves email ownership
 * (Better Auth marks the email verified BEFORE this runs).
 *
 * Security invariants:
 * - Only orders with profileId IS NULL are touched — owned orders are never
 *   reassigned, so an attacker cannot steal another user's orders.
 * - Matching is exact on customerEmail (already lowercase from Better Auth).
 * - Idempotent: the profileId IS NULL guard makes re-runs a no-op.
 *
 * @returns how many orders were linked.
 */
export async function claimGuestOrdersForVerifiedProfile(
  profileId: string,
  verifiedEmail: string,
): Promise<number> {
  const { count } = await prisma.order.updateMany({
    where: {
      profileId: null,
      customerEmail: verifiedEmail,
      isDeleted: false,
    },
    data: { profileId },
  });
  return count;
}