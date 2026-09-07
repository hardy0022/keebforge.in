"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export async function saveNewsletterOpt(optIn: boolean) {
  const { profile } = await requireUser();
  await prisma.customerProfile.upsert({
    where: { profileId: profile.id },
    update: { newsletterOpt: optIn },
    create: { profileId: profile.id, newsletterOpt: optIn },
  });
  revalidatePath("/account/settings");
}
