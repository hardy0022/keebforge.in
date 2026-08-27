"use client";

import { usePathname } from "next/navigation";

/** Renders its children (site header/footer) only outside /admin
 *  and any paths listed in `exclude`.
 *  Children stay server components; only the visibility decision is client-side
 *  (path is known during SSR, so there is no flash of site chrome in admin). */
export function ShowOnSite({ children, exclude }: { children: React.ReactNode; exclude?: string[] }) {
  const path = usePathname();
  if (path.startsWith("/admin")) return null;
  if (exclude?.some((p) => path.startsWith(p))) return null;
  return <>{children}</>;
}
