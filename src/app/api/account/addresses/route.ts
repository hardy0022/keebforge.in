import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentAuth } from "@/lib/auth/session";
import {
  checkRateLimit,
  clientIp,
  rateLimitResponse,
} from "@/lib/payments/rate-limit";
import { readJsonBody } from "@/lib/http/read-json-body";
import { addressBookFields } from "@/lib/validation/customer-input";
import { MAX_ADDRESS_BOOK } from "@/lib/utils/limits";

const addressSchema = z.object({ ...addressBookFields });

/** Per client, per minute — creating address rows is a cheap abuse vector. */
const RATE_LIMIT = { limit: 30, windowMs: 60_000 };

async function getCurrentProfile() {
  // getCurrentAuth (not a raw findUnique): it creates the Profile on first
  // access post-sign-up and handles seeded-profile claim-by-email.
  const { profile } = await getCurrentAuth();
  return profile;
}

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const addresses = await prisma.address.findMany({
    where: { profileId: profile.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(addresses);
}

export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const limit = checkRateLimit(`addresses:create:ip:${clientIp(req)}`, RATE_LIMIT);
  if (!limit.allowed) return rateLimitResponse(limit, "addresses");

  const body = await readJsonBody(req, 32 * 1024);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const parsed = addressSchema.safeParse(body.data ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid address." },
      { status: 400 },
    );
  }

  const a = parsed.data;
  const count = await prisma.address.count({
    where: { profileId: profile.id },
  });
  if (count >= MAX_ADDRESS_BOOK) {
    return NextResponse.json(
      { error: `You can save up to ${MAX_ADDRESS_BOOK} addresses.` },
      { status: 400 },
    );
  }

  if (a.isDefault) {
    await prisma.address.updateMany({
      where: { profileId: profile.id, isDefault: true },
      data: { isDefault: false },
    });
  }

  const address = await prisma.address.create({
    data: {
      profileId: profile.id,
      label: a.label || "Home",
      name: [a.firstName, a.lastName].filter(Boolean).join(" ").trim(),
      email: a.email || null,
      streetAddress: a.streetAddress,
      apartment: a.apartment || null,
      city: a.city,
      state: a.state,
      postalCode: a.postalCode,
      country: a.country || "India",
      phone: a.phone || null,
      isDefault: a.isDefault || false,
    },
  });

  return NextResponse.json(address, { status: 201 });
}