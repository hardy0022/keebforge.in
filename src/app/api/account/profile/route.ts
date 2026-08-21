import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/better-auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

async function getCurrentProfile() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user ?? null;
  if (!user) return null;

  const profile = await prisma.profile.findUnique({ where: { userId: user.id } });
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
    const { name, email, phone } = body;

    if (email && email !== profile.email) {
      const existing = await prisma.profile.findUnique({ where: { email } });
      if (existing && existing.id !== profile.id) {
        return NextResponse.json({ error: "Email already in use" }, { status: 400 });
      }
    }

    const updated = await prisma.profile.update({
      where: { id: profile.id },
      data: {
        name: name?.trim() || null,
        email: email?.trim().toLowerCase() || profile.email,
        phone: phone?.trim() || null,
      },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      avatarUrl: updated.avatarUrl,
    });
  } catch {
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}