"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ShowOnSite } from "@/components/layout/ShowOnSite";

/** Site chrome (header + footer) that skips /auth routes.
 *  Auth pages have their own layout with just the header.
 *  `footer` is a server-rendered element passed by the root layout. */
export function SiteChrome({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAuth = pathname.startsWith("/auth");
  const isMaintenance = pathname === "/maintenance";

  if (isAuth || isMaintenance) return <>{children}</>;

  return (
    <>
      <ShowOnSite>
        <SiteHeader />
      </ShowOnSite>
      <main className="page-main">{children}</main>
      <ShowOnSite exclude={["/mods/checkout", "/shop/checkout"]}>
        <div className={pathname === "/contact" ? "contact-footer" : undefined}>{footer}</div>
      </ShowOnSite>
    </>
  );
}
