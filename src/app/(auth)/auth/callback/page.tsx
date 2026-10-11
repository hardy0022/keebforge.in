import { redirect } from "next/navigation";
import { getCurrentAuth } from "@/lib/auth/session";

/** Post-OAuth landing. */
export default async function AuthCallbackPage() {
  const { user } = await getCurrentAuth();
  if (!user) redirect("/auth/login");
  redirect("/");
}
