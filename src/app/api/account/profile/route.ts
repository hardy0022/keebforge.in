import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { USERNAME_PATTERN } from "@/lib/username";
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
  return NextResponse.json({
    id: profile.id,
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    avatarUrl: profile.avatarUrl,
    createdAt: profile.createdAt,
  });
}

export async function PATCH(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, email, phone, username } = body;

    if (email && email !== profile.email) {
      const existing = await prisma.profile.findUnique({ where: { email } });
      if (existing && existing.id !== profile.id) {
        return NextResponse.json({ error: "Email already in use" }, { status: 400 });
      }
    }

    // Username: optional, format-checked, unique. Null clears it.
    let usernameValue: string | null = profile.username;
    if (username !== undefined) {
      const u = String(username).trim().toLowerCase();
      if (u === "") {
        usernameValue = null;
      } else {
        if (!USERNAME_PATTERN.test(u)) {
          return NextResponse.json({ error: "Invalid username" }, { status: 400 });
        }
        const existing = await prisma.profile.findUnique({ where: { username: u } });
        if (existing && existing.id !== profile.id) {
          return NextResponse.json({ error: "Username already taken" }, { status: 409 });
        }
        usernameValue = u;
      }
    }

    const updated = await prisma.profile.update({
      where: { id: profile.id },
      data: {
        name: name?.trim() || null,
        email: email?.trim().toLowerCase() || profile.email,
        phone: phone?.trim() || null,
        ...(username !== undefined ? { username: usernameValue } : {}),
      },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      avatarUrl: updated.avatarUrl,
      username: updated.username,
    });
  } catch {
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}