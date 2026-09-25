import assert from "node:assert/strict";
import {
  csvInt,
  csvPaise,
  readPriceOnly,
  toPaise,
  type ModPriceInput,
  type ReadPriceResult,
} from "@/lib/admin/pricing";
import { IMAGE_ROOT, isAppAsset } from "@/lib/images/asset-root";
import { STAFF_ORG_SLUG, staffOrgMemberWhere } from "@/lib/auth/admin";
import { allowedNavHrefs, canAction } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";

function errOf(r: ReadPriceResult): string {
  assert.ok("error" in r, "expected rejection but got data");
  return (r as { error: string }).error;
}

function dataOf(r: ReadPriceResult): ModPriceInput {
  assert.ok("data" in r, "expected data but got rejection");
  return (r as { data: ModPriceInput }).data;
}

(async () => {
  // H1 — review moderation decoupled from product:view; STAFF kept on a
  // dedicated review resource, CUSTOMER still excluded.
  assert.equal(canAction("ADMIN", "review", "delete"), true);
  assert.equal(canAction("STAFF", "review", "moderate"), true);
  assert.equal(canAction("STAFF", "review", "delete"), true);
  assert.equal(canAction("CUSTOMER", "review", "view"), false);
  assert.equal(canAction("STAFF", "product", "view"), true);
  assert.ok(allowedNavHrefs("STAFF").includes("/admin/reviews"));
  assert.ok(!allowedNavHrefs("CUSTOMER").includes("/admin/reviews"));
  console.log("PASS h1 review permission");

  // H3 — negative prices never reach the DB.
  assert.equal(toPaise("12.5"), 1250);
  assert.equal(toPaise(""), null);
  assert.equal(toPaise("-5"), -500);
  assert.equal(csvPaise("1234.56"), 123456);
  assert.equal(csvPaise("-1"), null);
  assert.equal(csvPaise("abc"), null);
  assert.equal(csvPaise(""), null);
  assert.equal(csvInt("5", 0), 5);
  assert.equal(csvInt("-3", 0), 0);
  assert.equal(csvInt("", 0), 0);

  const fd = (...pairs: [string, string][]): FormData => {
    const f = new FormData();
    f.set("id", "svc1");
    for (const [k, v] of pairs) f.set(k, v);
    return f;
  };
  assert.equal(
    errOf(readPriceOnly(fd(["price", "-5"]))),
    "Prices can't be negative.",
  );
  assert.equal(
    errOf(readPriceOnly(fd(["priceMin", "-100"]))),
    "Prices can't be negative.",
  );
  assert.equal(dataOf(readPriceOnly(fd(["price", "12.5"]))).price, 1250);
  assert.equal(errOf(readPriceOnly(fd())), "Set a price or a price range.");
  console.log("PASS h3 non-negative money/stock");

  // H2 — deletion is confined to the app's own Cloudinary subtree.
  assert.equal(isAppAsset("keebforge/products/x"), true);
  assert.equal(isAppAsset(`${IMAGE_ROOT}/products/x`), true);
  assert.equal(isAppAsset("keebforge"), false);
  assert.equal(isAppAsset("keebforge/"), true);
  assert.equal(isAppAsset("keebforge2/x"), false);
  assert.equal(isAppAsset("products/x"), false);
  assert.equal(isAppAsset("../etc/passwd"), false);
  console.log("PASS h2 asset containment");

  // C1 — only the designated staff org elevates (live, read-only).
  const owner = await prisma.member.findFirst({
    where: { organization: { slug: STAFF_ORG_SLUG } },
    select: { userId: true, role: true },
  });
  assert.ok(owner, "staff org has a member");
  assert.ok(["owner", "developer"].includes(owner.role));
  assert.equal(
    await prisma.member.count({ where: staffOrgMemberWhere(owner.userId) }),
    1,
  );
  const orgFilter = staffOrgMemberWhere(owner.userId)
    .organization as { slug?: string } | undefined;
  assert.equal(orgFilter?.slug, STAFF_ORG_SLUG);
  // A customer-created org must not grant elevation.
  assert.equal(
    await prisma.member.count({
      where: staffOrgMemberWhere(owner.userId, "attacker-org"),
    }),
    0,
  );
  console.log("PASS c1 org-scoped admin");

  console.log("ALL PHASE 1 CHECKS PASSED");
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});