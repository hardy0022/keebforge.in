import { redirect } from "next/navigation";
import { getCurrentAuth } from "@/lib/auth";
import { getAdminContext } from "@/lib/auth/admin";

/** Post-OAuth landing: route admins to /admin, everyone else to /. */
export default async function AuthCallbackPage() {
  const { user } = await getCurrentAuth();
  if (!user) redirect("/auth/login");
  redirect((await getAdminContext()) ? "/admin" : "/");
}