import { NextResponse } from "next/server";
import { getCurrentAuth } from "@/lib/auth";

export const runtime = "nodejs";

/** Lightweight client-facing endpoint: returns the signed-in user's role. */
export async function GET() {
  const { user, profile } = await getCurrentAuth();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, image: user.image }, role: profile?.role ?? "CUSTOMER" });
}