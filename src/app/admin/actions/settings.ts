"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/admin";
import type { ActionState } from "@/components/admin/ActionForm";

export async function toggleMaintenanceMode(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("setting", "update");

  const current = await prisma.siteSetting.findUnique({ where: { key: "maintenanceMode" } });
  const next = current?.value === true ? false : true;

  await prisma.siteSetting.upsert({
    where: { key: "maintenanceMode" },
    update: { value: next as Prisma.InputJsonValue },
    create: { key: "maintenanceMode", value: next as Prisma.InputJsonValue },
  });

  revalidatePath("/admin/settings");

  return { ok: true, message: next ? "Maintenance mode enabled." : "Maintenance mode disabled." };
}
