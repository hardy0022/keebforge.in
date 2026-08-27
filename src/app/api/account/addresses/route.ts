import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAuth } from "@/lib/auth";

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

  try {
    const body = await req.json();
    const { label, firstName, lastName, email, streetAddress, apartment, city, state, postalCode, country, phone, isDefault } = body;
    const name = [firstName, lastName].filter(Boolean).join(" ").trim();

    if (!firstName || !lastName || !streetAddress || !city || !state || !postalCode) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (phone && !/^\d{10}$/.test(phone)) {
      return NextResponse.json({ error: "Phone number must be exactly 10 digits." }, { status: 400 });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    if (isDefault) {
      await prisma.address.updateMany({
        where: { profileId: profile.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.create({
      data: {
        profileId: profile.id,
        label: label || "Home",
        name,
        email: email || null,
        streetAddress,
        apartment: apartment || null,
        city,
        state,
        postalCode,
        country: country || "India",
        phone: phone || null,
        isDefault: isDefault || false,
      },
    });

    return NextResponse.json(address, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create address" }, { status: 500 });
  }
}