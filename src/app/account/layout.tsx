import { redirect } from "next/navigation";
import { getCurrentAuth, requireUser } from "@/lib/auth";
import { AccountLayout } from "@/components/account/AccountLayout";

export default async function AccountLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getCurrentAuth();
  if (!user) redirect("/login");

  const { profile: authProfile } = await requireUser();

  return <AccountLayout profile={authProfile}>{children}</AccountLayout>;
}