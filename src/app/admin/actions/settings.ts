"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/admin";
import type { ActionState } from "@/components/admin/ActionForm";
import { MAINTENANCE_KEY, DEVELOPMENT_NOTICE_KEY } from "@/lib/config/environment";
import { invalidateSiteSettings } from "@/lib/caching/cache";
import {
  EMAIL_LABELS,
  emailSettingKey,
  isEmailType,
  isEmailTypeLocked,
} from "@/lib/email/email-policy";

export async function toggleMaintenanceMode(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("setting", "update");

  // Maintenance mode is production-only; the form always targets production.
  if (formData.get("environment") !== "production") {
    return { ok: false, error: "Invalid environment." };
  }

  const current = await prisma.siteSetting.findUnique({
    where: { key: MAINTENANCE_KEY },
  });
  const next = current?.value === true ? false : true;

  await prisma.siteSetting.upsert({
    where: { key: MAINTENANCE_KEY },
    update: { value: next as Prisma.InputJsonValue },
    create: { key: MAINTENANCE_KEY, value: next as Prisma.InputJsonValue },
  });

  revalidatePath("/admin/settings");
  invalidateSiteSettings();

  return {
    ok: true,
    message: `Maintenance mode ${next ? "enabled" : "disabled"}.`,
  };
}

export async function toggleDevelopmentNotice(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("setting", "update");

  const enabled = formData.get("enabled") === "true";
  const key = DEVELOPMENT_NOTICE_KEY;

  await prisma.siteSetting.upsert({
    where: { key },
    update: { value: enabled as Prisma.InputJsonValue },
    create: { key, value: enabled as Prisma.InputJsonValue },
  });

  revalidatePath("/admin/settings");
  invalidateSiteSettings();

  return {
    ok: true,
    message: `Development notice ${enabled ? "enabled" : "disabled"}.`,
  };
}

export async function toggleEmailNotification(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("setting", "update");

  const type = formData.get("type");
  if (!isEmailType(type)) {
    return { ok: false, error: "Unknown email type." };
  }

  const enabled = formData.get("enabled") === "true";
  // Locked types are always on: reject a disable even if the request bypasses
  // the UI (stale form, direct POST). Enabling is still allowed.
  if (!enabled && isEmailTypeLocked(type)) {
    return {
      ok: false,
      error: `${EMAIL_LABELS[type]} is required and cannot be disabled.`,
    };
  }
  const key = emailSettingKey(type);

  await prisma.siteSetting.upsert({
    where: { key },
    update: { value: enabled as Prisma.InputJsonValue },
    create: { key, value: enabled as Prisma.InputJsonValue },
  });

  revalidatePath("/admin/settings");
  invalidateSiteSettings();

  return {
    ok: true,
    message: `${EMAIL_LABELS[type]} email ${enabled ? "enabled" : "disabled"}.`,
  };
}
