"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/admin";
import type { ActionState } from "@/components/admin/ActionForm";
import { MAINTENANCE_KEY, type Environment } from "@/lib/environment";

const ENVIRONMENTS: Environment[] = ["production", "development"];

export async function toggleMaintenanceMode(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("setting", "update");

  const target = formData.get("environment");
  const env: Environment | undefined = ENVIRONMENTS.find((e) => e === target);
  if (!env) return { ok: false, error: "Invalid environment." };

  const key = MAINTENANCE_KEY[env];
  const current = await prisma.siteSetting.findUnique({ where: { key } });
  const next = current?.value === true ? false : true;

  await prisma.siteSetting.upsert({
    where: { key },
    update: { value: next as Prisma.InputJsonValue },
    create: { key, value: next as Prisma.InputJsonValue },
  });

  revalidatePath("/admin/settings");

  const label = env === "production" ? "Production" : "Development";
  return { ok: true, message: `${label} maintenance mode ${next ? "enabled" : "disabled"}.` };
}
