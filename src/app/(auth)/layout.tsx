import { SiteHeader } from "@/components/layout/SiteHeader";
import { ShowOnSite } from "@/components/layout/ShowOnSite";

/** Dedicated auth chrome: navbar only, no site footer — auth screens end
 *  after the card (the .auth-page container already fills the viewport). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ShowOnSite>
        <SiteHeader />
      </ShowOnSite>
      <main className="page-main">{children}</main>
    </>
  );
}
