import { NextResponse } from "next/server";
import { getSiteSetting } from "@/lib/catalog/data";
import { DEVELOPMENT_NOTICE_KEY } from "@/lib/config/environment";

/**
 * Public sitewide flags, resolved server-side and read by the site chrome
 * (footer status pill + "under development" notice) over HTTP.
 *
 * Why this exists: the root layout used to import these through
 * `@/lib/catalog/data` -> `@/lib/db/prisma`, which dragged the Prisma query
 * engine into every page that has no other database work — 16 routes, ~23 MB
 * of Prisma each. Fetching over HTTP keeps that import edge out of the layout.
 */

/**
 * THE allowlist. The request takes no key parameter and nothing here is
 * derived from client input, so there is no way to ask this endpoint for an
 * arbitrary — or private/admin — SiteSetting row. Adding a key is a
 * deliberate code change, reviewed like any other.
 */
const PUBLIC_SETTING_KEYS = {
  acceptingOrders: "acceptingOrders",
  developmentNotice: DEVELOPMENT_NOTICE_KEY,
} as const;

export const dynamic = "force-dynamic";

/**
 * Deliberately not cached at the CDN/route layer: admin saves call
 * `invalidateSiteSettings()` -> `updateTag(TAG.siteSettings)`, which purges
 * the `unstable_cache` entry inside `getSiteSetting`. That only reaches the
 * public UI if this handler actually re-runs, so a static route would
 * reintroduce the staleness the admin toggle is supposed to remove.
 */
export async function GET() {
  try {
    const [accepting, developmentNotice] = await Promise.all([
      getSiteSetting(PUBLIC_SETTING_KEYS.acceptingOrders),
      getSiteSetting(PUBLIC_SETTING_KEYS.developmentNotice),
    ]);

    return NextResponse.json({
      // Same truthiness rules the server-rendered reads used: only an explicit
      // `false` closes the site, so a missing row leaves orders open.
      acceptingOrders: accepting !== false,
      // Only an explicit `true` shows the notice.
      developmentNotice: developmentNotice === true,
    });
  } catch {
    // Fail exactly like the old reads did on error: orders open, notice hidden.
    // Never assert a maintenance/development state we could not read.
    return NextResponse.json({
      acceptingOrders: true,
      developmentNotice: false,
    });
  }
}
