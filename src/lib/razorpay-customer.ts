import type Razorpay from "razorpay";
import { prisma } from "@/lib/prisma";

/**
 * Server-only helper: returns a reusable Razorpay Customer id for an order,
 * creating the customer on first contact and persisting the id on the
 * KeebForge Profile so later orders from the same account reuse it.
 *
 * Razorpay `customers.create` requires a name and at least one of
 * email/contact. When those are missing this does NOT silently create an
 * invalid customer — it logs and returns null and the payment proceeds
 * unassociated. A failed API call is logged and degrades the same way so the
 * payment flow never breaks because of customer sync.
 */
export async function ensureRazorpayCustomer(
  api: Razorpay,
  params: {
    /** Logged-in customer profile, if the order goes through an account. */
    profile?: { id: string; razorpayCustomerId: string | null } | null;
    /** Customer already captured on this order (re-pay dedup). */
    existingId?: string | null;
    name: string | null;
    email?: string | null;
    contact?: string | null;
  },
): Promise<string | null> {
  const { profile, existingId, name } = params;
  const email = params.email?.trim().toLowerCase() || null;
  const contact = params.contact?.trim() || null;

  if (existingId) {
    console.log(`[razorpay-customer] reuse from order: ${existingId}`);
    return existingId;
  }
  if (profile?.razorpayCustomerId) {
    console.log(`[razorpay-customer] reuse from profile ${profile.id}: ${profile.razorpayCustomerId}`);
    return profile.razorpayCustomerId;
  }

  // A profile may already exist for this email (repeat guest / re-login) with
  // a known customer. Reuse it and copy the id onto the current profile.
  let persistProfileId = profile?.id ?? null;
  if (email) {
    const byEmail = await prisma.profile.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, razorpayCustomerId: true },
    });
    if (byEmail?.razorpayCustomerId) {
      if (persistProfileId && persistProfileId !== byEmail.id) {
        await prisma.profile.update({ where: { id: persistProfileId }, data: { razorpayCustomerId: byEmail.razorpayCustomerId } });
        console.log(`[razorpay-customer] copied ${byEmail.razorpayCustomerId} from ${byEmail.id} to ${persistProfileId}`);
      }
      return byEmail.razorpayCustomerId;
    }
    if (byEmail) persistProfileId = byEmail.id;
  }

  const contactName = name?.trim() || null;
  if (!contactName || (!email && !contact)) {
    console.warn(`[razorpay-customer] skipped: name=${Boolean(contactName)} email=${Boolean(email)} contact=${Boolean(contact)}`);
    return null;
  }

  try {
    const created = await api.customers.create({
      name: contactName,
      ...(email ? { email } : {}),
      ...(contact ? { contact } : {}),
      fail_existing: 0, // fetch existing customer if this email/contact is known
      notes: { source: "keebforge" },
    });
    if (persistProfileId) {
      await prisma.profile.update({ where: { id: persistProfileId }, data: { razorpayCustomerId: created.id } });
    }
    console.log(`[razorpay-customer] created ${created.id} for ${email ?? contact ?? contactName}`);
    return created.id;
  } catch (e) {
    console.error("[razorpay-customer] creation failed:", e);
    return null;
  }
}