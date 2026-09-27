import { redirect } from "next/navigation";
import { getCurrentAuth, requireUser } from "@/lib/auth/session";
import { AccountLayout } from "@/components/account/AccountLayout";

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
