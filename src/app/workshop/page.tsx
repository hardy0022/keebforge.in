import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getCurrentAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { AddressDTO } from "@/components/repair/RepairIntake";
import { RepairIntake } from "@/components/repair/RepairIntake";
import { WhyForge } from "@/components/home/WhyForge";

export const metadata: Metadata = buildMetadata({
  title: "Keyboard Workshop — Repairs, Builds & Restoration | KeebForge",
  description:
    "Repairs, custom work, builds, restoration, and technical services for keyboards and desk setups. Tell us what you're working on and get a quote after inspection.",
  path: "/workshop",
});

export default async function RepairPage() {
  const { profile } = await getCurrentAuth();
  const addresses: AddressDTO[] = profile
    ? (
        await prisma.address.findMany({
          where: { profileId: profile.id },
          orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
          select: { id: true, label: true, streetAddress: true, city: true, state: true, postalCode: true, isDefault: true },
        })
      ).map((a) => ({ ...a }))
    : [];

  return (
    <main className="ri-page">
      <header className="ri-hero">
        <p className="sec-num">{"// Workshop"}</p>
        <h1 className="ri-hero-title">Keyboard Workshop</h1>
        <p className="ri-hero-desc">
          Repairs, custom work, builds, restoration, and technical services for keyboards and desk setups —
          tell us what you&apos;re working on and we&apos;ll help you figure out the next step.
        </p>
      </header>

      <RepairIntake
        defaults={{ name: profile?.name ?? "", email: profile?.email ?? "", phone: profile?.phone ?? "" }}
        addresses={addresses}
      />

      <WhyForge num="// Why Forge" />
    </main>
  );
}
