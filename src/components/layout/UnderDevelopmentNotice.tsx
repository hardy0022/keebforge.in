import { getSiteSetting } from "@/lib/catalog/data";
import { DEVELOPMENT_NOTICE_KEY } from "@/lib/config/environment";

const SHOP_URL = "https://shop.keebforge.in/";

/**
 * Site-wide "still under development" notice, rendered in the root layout.
 * Fixed just under the fixed navbar so it never fights the navbar itself.
 *
 * Server-rendered from the same cached `getSiteSetting` read an admin save
 * already invalidates, so the banner AND the `body:has(.kf-dev-notice)`
 * padding it reserves are both in the first HTML response. It used to be a
 * client component that waited on `/api/settings/public`, so the banner
 * mounted after hydration and pushed the whole page down by `--notice-h`
 * mid-load (CLS 0.0753 on mobile /work). One cached read replaces that
 * client round-trip — no second request. Only an explicit `true` shows the
 * banner, so a failed or unread setting keeps it hidden, and the admin toggle
 * is unchanged: `invalidateSiteSettings()` purges this same cache entry.
 */
export async function UnderDevelopmentNotice() {
  if ((await getSiteSetting(DEVELOPMENT_NOTICE_KEY)) !== true) return null;

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
