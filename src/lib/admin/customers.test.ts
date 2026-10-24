import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  mergeCustomerRows,
  parseCustomerKind,
} from "@/lib/admin/customer-rows";

/**
 * Admin customer list — registered accounts and guest checkouts.
 *
 * The guarantees being pinned:
 *   1. The list is ONE list: registered accounts and guest checkouts are
 *      merged and ordered by date, not shown as two separate tables.
 *   2. Pagination over the merged list is exact. Each side is fetched as its
 *      own newest-first slice, so the merge must recover the global page and
 *      must not drop a guest that falls between two registered customers.
 *   3. The kind filter is a closed set — an unknown value falls back to "all"
 *      rather than silently hiding every row.
 *   4. A guest IS the absence of a Profile for an order's email. That is the
 *      only definition the query can express, so it is pinned at the source
 *      level: a guest must be an order email with no Profile, never "an order
 *      with no profileId" (which would mislabel a registered customer whose
 *      guest order has not been claimed yet as a guest).
 *
 * Offline: no database, no network.
 *
 * Run: npm run check:admin-customers
 */

let n = 0;
const pass = (msg: string) => {
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${msg}`);
};

const REPO = path.resolve(import.meta.dirname, "..", "..", "..");

const day = (d: string) => new Date(`2026-01-${d}T00:00:00.000Z`);

type Row = {
  sortDate: Date;
  email: string;
  row: { id: string; email: string; isGuest: boolean };
};

const reg = (email: string, d: string): Row => ({
  sortDate: day(d),
  email,
  row: { id: `p_${email}`, email, isGuest: false },
});

const guest = (email: string, d: string): Row => ({
  sortDate: day(d),
  email,
  row: { id: `guest:${email}`, email, isGuest: true },
});

// ── 1. The kind filter is a closed set ──────────────────────────────────────

assert.equal(parseCustomerKind(undefined), "all");
assert.equal(parseCustomerKind(""), "all");
assert.equal(parseCustomerKind("all"), "all");
assert.equal(parseCustomerKind("registered"), "registered");
assert.equal(parseCustomerKind("guest"), "guest");
assert.equal(parseCustomerKind("GUEST"), "all");
assert.equal(parseCustomerKind("drop table"), "all");
assert.equal(parseCustomerKind("registered "), "all");
pass("the kind filter accepts only registered/guest and falls back to all");

// ── 2. The merge is one newest-first list ───────────────────────────────────

{
  const merged = mergeCustomerRows(
    [reg("a@x.com", "10"), reg("b@x.com", "01")],
    [guest("g@x.com", "05")],
    0,
    15,
  );
  assert.deepEqual(
    merged.map((m) => m.email),
    ["a@x.com", "g@x.com", "b@x.com"],
    "registered and guest rows interleave by date",
  );
  assert.equal(
    merged.filter((m) => m.row.isGuest).length,
    1,
    "guest rows stay flagged as guests through the merge",
  );
  pass("registered and guest rows merge into one newest-first list");
}

// ── 3. Ties break on email so pages are stable ──────────────────────────────

{
  const merged = mergeCustomerRows(
    [reg("b@x.com", "05"), reg("a@x.com", "05")],
    [guest("c@x.com", "05")],
    0,
    15,
  );
  assert.deepEqual(
    merged.map((m) => m.email),
    ["a@x.com", "b@x.com", "c@x.com"],
    "equal dates are ordered by email",
  );
  pass("equal dates are broken by email so the page order is stable");
}

// ── 4. Pagination over the merged list is exact ─────────────────────────────

{
  // Three registered, two guests, interleaved. Page size 2.
  const registered = [reg("r1@x.com", "09"), reg("r2@x.com", "06"), reg("r3@x.com", "03")];
  const guests = [guest("g1@x.com", "08"), guest("g2@x.com", "04")];

  const page1 = mergeCustomerRows(registered, guests, 0, 2);
  const page2 = mergeCustomerRows(registered, guests, 2, 2);
  const page3 = mergeCustomerRows(registered, guests, 4, 2);

  assert.deepEqual(page1.map((m) => m.email), ["r1@x.com", "g1@x.com"]);
  assert.deepEqual(page2.map((m) => m.email), ["r2@x.com", "g2@x.com"]);
  assert.deepEqual(page3.map((m) => m.email), ["r3@x.com"]);
  assert.equal(page3.length, 1, "the last page holds the remainder");
  pass("pages split the merged list exactly, with no row lost or repeated");
}

// ── 5. A guest beyond the registered window is still found ──────────────────

{
  // The guest is OLDER than every registered customer, so it sits at the very
  // end of the merged list. The registered side is fetched as its own first-N
  // slice; the guest must still land in the global page.
  const registered = [reg("r1@x.com", "09"), reg("r2@x.com", "08")];
  const guests = [guest("g1@x.com", "01")];

  const page1 = mergeCustomerRows(registered, guests, 0, 2);
  const page2 = mergeCustomerRows(registered, guests, 2, 2);
  assert.deepEqual(page1.map((m) => m.email), ["r1@x.com", "r2@x.com"]);
  assert.deepEqual(page2.map((m) => m.email), ["g1@x.com"]);
  pass("a guest older than every registered customer is not dropped");
}

// ── 6. The merge never mutates its inputs ───────────────────────────────────

{
  const registered = [reg("r1@x.com", "09"), reg("r2@x.com", "08")];
  const guests = [guest("g1@x.com", "01")];
  const before = registered.map((r) => r.email);
  mergeCustomerRows(registered, guests, 0, 1);
  assert.deepEqual(
    registered.map((r) => r.email),
    before,
    "the registered slice must come back untouched",
  );
  pass("the merge does not mutate the slices it was given");
}

// ── 7. Guest detection is source-pinned (the SQL is the definition) ─────────

{
  const src = fs.readFileSync(
    path.join(REPO, "src/lib/admin/customers.ts"),
    "utf8",
  );

  assert.ok(
    src.includes("NOT EXISTS ("),
    "a guest must be detected with NOT EXISTS",
  );
  assert.ok(
    src.includes('FROM "Profile" pr WHERE pr.email = o."customerEmail"'),
    "a guest must be an order email with NO Profile for that email",
  );
  assert.ok(
    !src.includes("profileId: null"),
    "a guest must never be defined as an unlinked order: a registered customer whose guest order has not been claimed yet would be mislabelled a guest",
  );
  assert.ok(
    src.includes('role: "CUSTOMER"'),
    "registered customers stay restricted to the CUSTOMER role",
  );
  assert.ok(
    src.includes("COUNT(*) OVER ()::bigint AS \"totalGuests\""),
    "the guest count must be computed over every guest, not the page",
  );
  assert.ok(
    src.includes("COALESCE(SUM(g.\"totalSpent\") OVER (), 0)::bigint AS \"totalGuestSpent\""),
    "guest spend must be computed over every guest, not the page",
  );
  assert.ok(
    src.includes("prisma.$queryRaw"),
    "the guest aggregate must be parameterised SQL, never string-concatenated",
  );
  assert.ok(
    src.includes('ORDER BY g."firstOrder" DESC, g.email ASC'),
    "the guest side must be ordered newest-first with the email tie-break",
  );
  assert.ok(
    src.includes('orderBy: [{ createdAt: "desc" }, { email: "asc" }]'),
    "the registered side must use the same tie-break, so both sides agree on which row belongs on a page",
  );
  pass("guest detection is defined by the absence of a Profile, and the aggregates are all-time");
}

// ── 8. The page is permission-gated and renders the guest marker ────────────

{
  const page = fs.readFileSync(
    path.join(REPO, "src/app/admin/customers/page.tsx"),
    "utf8",
  );
  assert.ok(
    page.includes('requirePermission("customer", "view")'),
    "the customer list must stay permission-gated",
  );
  assert.ok(page.includes("GUEST"), "guest rows must be marked as guests");
  assert.ok(
    page.includes("c.isGuest"),
    "the guest marker must be driven by the row flag, not hard-coded",
  );
  assert.ok(
    page.includes('name="kind"'),
    "the page must offer the registered/guest filter",
  );
  assert.ok(
    page.includes("First order"),
    "a guest has no join date — the date shown must say what it is",
  );
  pass("the admin page marks guest rows, gates on permission and offers the filter");
}

console.log(`\n${n} admin customer checks passed`);
