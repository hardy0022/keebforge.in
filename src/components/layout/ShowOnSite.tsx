"use client";

import { usePathname } from "next/navigation";

/** Renders its children (site header/footer) only outside /admin.
 *  Children stay server components; only the visibility decision is client-side
 *  (path is known during SSR, so there is no flash of site chrome in admin). */
export function ShowOnSite({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path.startsWith("/admin")) return null;
  return <>{children}</>;
}
