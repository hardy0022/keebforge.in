import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAuth, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SettingsPanel } from "@/components/account/SettingsPanel";

export const metadata: Metadata = {
  title: "Settings | KeebForge",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const { user } = await getCurrentAuth();
  if (!user) redirect("/auth/login");

  const { profile } = await requireUser();

  const [customer, credentialAccount] = await Promise.all([
    prisma.customerProfile.findUnique({
      where: { profileId: profile.id },
      select: { newsletterOpt: true },
    }),
    prisma.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
      select: { password: true },
    }),
  ]);

  return (
    <SettingsPanel
      newsletter={customer?.newsletterOpt ?? false}
      hasPassword={Boolean(credentialAccount?.password)}
    />
  );
}