"use client";

import { usePublicSettings } from "@/components/layout/public-settings";

const SHOP_URL = "https://shop.keebforge.in/";

/**
 * Site-wide "still under development" notice, rendered in the root layout.
 * Fixed to the bottom of the viewport so it never fights the fixed navbar.
 *
 * Now client-fetched from /api/settings/public: the key, its SiteSetting row,
 * and the admin toggle that invalidates it are all unchanged — only the import
 * edge that pulled Prisma into every page moved. Still only an explicit `true`
 * shows the banner, so a failed or unread setting keeps it hidden.
 */
export function UnderDevelopmentNotice() {
  const settings = usePublicSettings();
  if (settings?.developmentNotice !== true) return null;

  return (
    <div className="kf-dev-notice" role="status">
      <span>
        KeebForge.in is still under development. If you find it difficult to use
        or run into problems, please shop at{" "}
        <a href={SHOP_URL} target="_blank" rel="noopener noreferrer">
          shop.keebforge.in
        </a>
        .
      </span>
    </div>
  );
}
