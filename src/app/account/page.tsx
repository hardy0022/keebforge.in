import { redirect } from "next/navigation";

/**
 * The customer dashboard is gone — the navbar profile dropdown is the account
 * navigation and profile is the landing page.
 */
export default function AccountPage() {
  redirect("/account/profile");
}
