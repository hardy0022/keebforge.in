import { getSiteSetting } from "@/lib/catalog/data";
import { DEVELOPMENT_NOTICE_KEY } from "@/lib/config/environment";

const SHOP_URL = "https://shop.keebforge.in/";

/**
 * Site-wide "still under development" notice. Read from SiteSetting (cached,
 * invalidated by the admin toggle) and rendered in the root layout. Fixed to
 * the bottom of the viewport so it never fights the fixed navbar.
 */
export async function UnderDevelopmentNotice() {
  const enabled = (await getSiteSetting(DEVELOPMENT_NOTICE_KEY)) === true;
  if (!enabled) return null;

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