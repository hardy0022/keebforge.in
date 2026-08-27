import { redirect } from "next/navigation";

/** /profile is served by the account area. */
export default function ProfileRedirect() {
  redirect("/account/profile");
}
