import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentAuth, requireUser } from "@/lib/auth/session";
import { AccountLayout } from "@/components/account/AccountLayout";

// The root layout's indexable metadata otherwise leaks into the login redirect
// this layout emits for signed-out visitors.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AccountLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getCurrentAuth();
  if (!user) redirect("/auth/login");

  // Keeps the customer guard + profile provisioning in place; the layout no
  // longer renders the identity block, so the result is not needed.
  await requireUser();

  return <AccountLayout>{children}</AccountLayout>;
}
