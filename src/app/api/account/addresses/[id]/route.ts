import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAuth } from "@/lib/auth";

async function getCurrentProfile() {
  // getCurrentAuth (not a raw findUnique): it creates the Profile on first
  // access post-sign-up and handles seeded-profile claim-by-email.
  const { profile } = await getCurrentAuth();
  return profile;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
  { params }: { params: Promise<{ id: string }> }
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

  try {
    const body = await req.json();
    const { label, firstName, lastName, email, streetAddress, city, state, postalCode, country, phone, isDefault } = body;
    const name = [firstName, lastName].filter(Boolean).join(" ").trim() || null;

    if (phone != null && phone !== "" && !/^\d{10}$/.test(phone)) {
      return NextResponse.json({ error: "Phone number must be exactly 10 digits." }, { status: 400 });
    }
    if (email != null && email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    if (isDefault && !existing.isDefault) {
      await prisma.address.updateMany({
        where: { profileId: profile.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.update({
      where: { id },
      data: {
        label: label ?? existing.label,
        name: name ?? existing.name,
        email: email ?? existing.email,
        streetAddress: streetAddress ?? existing.streetAddress,
        city: city ?? existing.city,
        state: state ?? existing.state,
        postalCode: postalCode ?? existing.postalCode,
        country: country ?? existing.country,
        phone: phone === "" ? null : phone ?? existing.phone,
        isDefault: isDefault ?? existing.isDefault,
      },
    });

    return NextResponse.json(address);
  } catch {
    return NextResponse.json({ error: "Failed to update address" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

  try {
    await prisma.address.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete address" }, { status: 500 });
  }
}