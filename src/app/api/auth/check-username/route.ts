import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { USERNAME_PATTERN } from "@/lib/username";

export const runtime = "nodejs";

/**
 * GET /api/auth/check-username?u=<name> — real availability check against the
 * Profile table. Public (no account data leaves; only a boolean).
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("u") ?? "";
  if (!USERNAME_PATTERN.test(raw)) {
    return NextResponse.json({ available: false, reason: "invalid" });
  }
  const taken = await prisma.profile.findUnique({ where: { username: raw.toLowerCase() }, select: { id: true } });
  return NextResponse.json({ available: !taken });
}
