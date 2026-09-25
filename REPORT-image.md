# KeebForge — Image Delivery Report (corrected)

## Headline correction (self-inflicted unit bug, now fixed)

My earlier audit labeled the LCP `size` as **kiloBytes**. It is actually **pixel AREA**
(`largest-contentful-paint` entries expose `size` = naturalWidth × naturalHeight, not bytes).
The "210 KB Cloudinary LCP image" I reported was wrong: that number is **640 × 329 = 210,528 px²**.

**True delivered bytes (measured, settled, dev):** the LCP image on product pages is
**30,456 B decoded / 30,756 B transferred**, delivered at `f_auto,q_auto,c_limit,w_640`.
Across **all** measured images (all routes × all runs, 67 cloudinary resources):
- **max single image = 37.0 KB decoded**
- median 13.9 KB · mean 18.9 KB · **total across everything = 1.26 MB decoded**

There is **no oversized-image problem on this site.** Every cloudinary URL already carries
f_auto, q_auto, c_limit, and w_640 (single src of truth: `src/lib/images/cloudinary-url.ts`) —
format/quality/width are already auto-optimized, and Cloudinary `res.cloudinary.com` is not
blocking LCP beyond the image's own (now-measured) ~34 ms delivery.

## What this changes

| Claim in previous report | Reality (measured bytes) | Verdict |
|---|---|---|
| "Product LCP image ~210 KB — #1 fix" | **30.4 KB** (f_auto,q_auto,c_limit,w_640) | **No action — already optimal** |
| "Work detail ~220 KB" | ~35 KB | No action |
| "Shop category cards 41–51 KB" | 5.7–12.7 KB | No action |
| "Decoded ~5.9 MB/page = images" | JS/RSC fan-out is the decoded cost, **not images** | Prod JS audit (separate) |
| "Image sizing batch yields biggest win" | no bytes to reclaim | **Not a supply win; re-measure prod** |

## Actual measured image-specific numbers (settled best, wired to true resource bytes)

| route | LCPms | LCP area px² | deliv w_ | decoded B | xfer B |
|---|---|---|---|---|---|
| product/corne-choc | 592 | 210,528 | 640 | 36,993 | 37,293 |
| product/corne-mx   | 600 | 210,528 | 640 | 30,456 | 30,756 |
| shop category card | 488 | 40,656 | 384 | 12,656 | 12,956 |
| home/shop/about etc. | 148–223 | text LCP | — | (no image) | — |

LCP timing on product pages (~480–600 ms) matches the **navigation/resource fan-out tail** of
the RSC payload, **not** image delivery (image itself: ttfb ~30 ms, dur ~30–34 ms).

## Phase-5 verification (visual/intrinsic/format) for the LCP image changed? → NONE CHANGED

Per the audit contract ("do not optimize images merely because they exist", "re-measure in prod"),
no image, component, config, or delivery transform was modified. Cloudinary is already delivering
`f_auto/q_auto/c_limit/w_640` via `cldUrl`, the product gallery marks `priority` on the first (LCP)
image, and home hero sets `priority + fetchPriority` already. Nothing to shrink in dev.

## Recommendation (production-real, sequential)

1. **Do NOT run an image-optimization batch** — the lever measured empty. Verify in the prod build
   (this harness + `next start`) that Cloudinary auto flags + priority behave the same, then close
   image work. (If you intended "make sure images aren't the bottleneck," they aren't.)
2. **Next: production JS/RSC audit** (the real fan-out). Re-run the same CDP harness against the
   production build BEFORE touching JS — consistent with your "measure → understand → change" rule.
3. **Analytics/third-party (Umami, GTM, VA, better-auth KV)** only if the prod audit shows they
   contribute tail latency. Non-blocking today.

No code, schema, DB, env, auth, cache, analytics, or image-delivery change was made in any phase of
this task. Data: `/tmp/opencode/audit/results/*.json`; corrections script: `map_lcp.py`,
`facts_settled.py`.
