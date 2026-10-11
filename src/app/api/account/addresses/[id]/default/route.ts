import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/better-auth";
import { prisma } from "@/lib/db/prisma";
import { headers } from "next/headers";
import {
  checkRateLimit,
  clientIp,
  rateLimitResponse,
} from "@/lib/payments/rate-limit";

/** Shares the address-mutation budget with PATCH/DELETE. */
const RATE_LIMIT = { limit: 30, windowMs: 60_000 };

async function getCurrentProfile() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user ?? null;
  if (!user) return null;

  const profile = await prisma.profile.findUnique({
    where: { userId: user.id },
  });
  return profile;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const limit = checkRateLimit(
    `addresses:mutate:ip:${clientIp(req)}`,
    RATE_LIMIT,
  );
  if (!limit.allowed) return rateLimitResponse(limit, "addresses");

  const { id } = await params;

  const existing = await prisma.address.findFirst({
    where: { id, profileId: profile.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Address not found" }, { status: 404 });
  }

  try {
    await prisma.$transaction([
      prisma.address.updateMany({
        where: { profileId: profile.id, isDefault: true },
        data: { isDefault: false },
      }),
      prisma.address.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to set default address" },
      { status: 500 },
    );
  }
}
