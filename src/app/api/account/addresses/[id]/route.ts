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
import {
  emailField,
  optionalText,
  pinCodeField,
  requiredText,
} from "@/lib/validation/customer-input";
import { MAX_ADDRESS_LINE, MAX_LABEL, MAX_NAME } from "@/lib/utils/limits";
import { PHONE_RE } from "@/lib/utils/phone";

/**
 * PATCH semantics (mirrors how the address form actually edits):
 *  - every field is optional; absent means "keep the stored value";
 *  - `""` for apartment / phone / email / label / country clears the optional
 *    field, matching POST + the address book UI;
 *  - `""` for a REQUIRED field (names, street, city, state, PIN) is rejected —
 *    it must never silently blank a required field.
 */
const addressPatchSchema = z.object({
  label: optionalText(MAX_LABEL),
  firstName: requiredText("First name", MAX_NAME).optional(),
  lastName: requiredText("Last name", MAX_NAME).optional(),
  email: emailField().optional(),
  streetAddress: requiredText("Address", MAX_ADDRESS_LINE).optional(),
  apartment: optionalText(MAX_ADDRESS_LINE),
  city: requiredText("City", 100).optional(),
  state: requiredText("State", 100).optional(),
  postalCode: pinCodeField().optional(),
  country: optionalText(100),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || PHONE_RE.test(v), "Phone number must be exactly 10 digits.")
    .optional(),
  isDefault: z.boolean().optional(),
});

/** Per client, per minute — address writes are cheap to loop. */
const RATE_LIMIT = { limit: 30, windowMs: 60_000 };

async function getCurrentProfile() {
  const { profile } = await getCurrentAuth();
  return profile;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const address = await prisma.address.findFirst({
    where: { id, profileId: profile.id },
  });

  if (!address) {
    return NextResponse.json({ error: "Address not found" }, { status: 404 });
  }

  return NextResponse.json(address);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.address.findFirst({
    where: { id, profileId: profile.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Address not found" }, { status: 404 });
  }

  const limit = checkRateLimit(`addresses:mutate:ip:${clientIp(req)}`, RATE_LIMIT);
  if (!limit.allowed) return rateLimitResponse(limit, "addresses");

  const body = await readJsonBody(req, 32 * 1024);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const parsed = addressPatchSchema.safeParse(body.data ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid address." },
      { status: 400 },
    );
  }

  const a = parsed.data;
  const nameParts = [a.firstName, a.lastName]
    .filter((v): v is string => v !== undefined && v !== "")
    .join(" ")
    .trim();

  if (a.isDefault && !existing.isDefault) {
    await prisma.address.updateMany({
      where: { profileId: profile.id, isDefault: true },
      data: { isDefault: false },
    });
  }

  const address = await prisma.address.update({
    where: { id },
    data: {
      label: a.label === undefined || a.label === "" ? existing.label : a.label,
      name: nameParts || existing.name,
      email: a.email === "" ? null : (a.email ?? existing.email),
      streetAddress: a.streetAddress ?? existing.streetAddress,
      apartment: a.apartment === "" ? null : (a.apartment ?? existing.apartment),
      city: a.city ?? existing.city,
      state: a.state ?? existing.state,
      postalCode: a.postalCode ?? existing.postalCode,
      country:
        a.country === undefined || a.country === ""
          ? existing.country
          : a.country,
      phone: a.phone === undefined ? existing.phone : (a.phone === "" ? null : a.phone),
      isDefault: a.isDefault ?? existing.isDefault,
    },
  });

  return NextResponse.json(address);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.address.findFirst({
    where: { id, profileId: profile.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Address not found" }, { status: 404 });
  }

  const limit = checkRateLimit(`addresses:mutate:ip:${clientIp(req)}`, RATE_LIMIT);
  if (!limit.allowed) return rateLimitResponse(limit, "addresses");

  try {
    await prisma.address.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete address" },
      { status: 500 },
    );
  }
}