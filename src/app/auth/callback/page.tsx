import { redirect } from "next/navigation";
import { getCurrentAuth, isAdminRole } from "@/lib/auth";

/** Post-OAuth landing: route admins to /admin, everyone else to /. */
export default async function AuthCallbackPage() {
  const { user, profile } = await getCurrentAuth();
  if (!user) redirect("/login");
  redirect(isAdminRole(profile!.role) ? "/admin" : "/");
}