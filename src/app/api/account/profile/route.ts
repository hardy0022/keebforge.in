import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { USERNAME_PATTERN } from "@/lib/utils/username";
import { PHONE_RE } from "@/lib/utils/phone";
import { getCurrentAuth } from "@/lib/auth/session";
import {
  checkRateLimit,
  clientIp,
  rateLimitResponse,
} from "@/lib/payments/rate-limit";
import { readJsonBody } from "@/lib/http/read-json-body";
import { emailField } from "@/lib/validation/customer-input";
import { MAX_NAME } from "@/lib/utils/limits";

/** Every field optional; absent/empty keeps the stored value (phone/name may clear). */
const patchSchema = z.object({
  name: z
    .string()
    .trim()
    .max(MAX_NAME, `Name must be under ${MAX_NAME} characters.`)
    .optional(),
  email: emailField().optional(),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || PHONE_RE.test(v), "Phone number must be exactly 10 digits.")
    .optional(),
  username: z.string().trim().max(40).optional(),
});

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

  const limit = checkRateLimit(`profile:mutate:ip:${clientIp(req)}`, RATE_LIMIT);
  if (!limit.allowed) return rateLimitResponse(limit, "profile");

  try {
    const body = await readJsonBody(req, 32 * 1024);
    if (!body.ok) {
      return NextResponse.json({ error: body.error }, { status: body.status });
    }

    const parsed = patchSchema.safeParse(body.data ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Failed to update profile" },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const emailValue =
      d.email === undefined || d.email === "" ? profile.email : d.email;
    if (emailValue !== profile.email) {
      const existing = await prisma.profile.findUnique({
        where: { email: emailValue },
      });
      if (existing && existing.id !== profile.id) {
        return NextResponse.json(
          { error: "Email already in use" },
          { status: 400 },
        );
      }
    }

    // Username: optional, format-checked, unique. Null clears it.
    let usernameValue: string | null = profile.username;
    if (d.username !== undefined) {
      const u = d.username.toLowerCase();
      if (u === "") {
        usernameValue = null;
      } else {
        if (!USERNAME_PATTERN.test(u)) {
          return NextResponse.json(
            { error: "Invalid username" },
            { status: 400 },
          );
        }
        const existing = await prisma.profile.findUnique({
          where: { username: u },
        });
        if (existing && existing.id !== profile.id) {
          return NextResponse.json(
            { error: "Username already taken" },
            { status: 409 },
          );
        }
        usernameValue = u;
      }
    }

    const nameValue =
      d.name === undefined || d.name === "" ? null : d.name;
    const phoneValue =
      d.phone === undefined || d.phone === "" ? null : d.phone;

    const updated = await prisma.profile.update({
      where: { id: profile.id },
      data: {
        name: nameValue,
        email: emailValue,
        phone: phoneValue,
        ...(d.username !== undefined ? { username: usernameValue } : {}),
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
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 },
    );
  }
}