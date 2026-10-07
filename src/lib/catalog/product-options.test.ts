/**
 * Offline regression suite for configurable-product option groups (SINGLE
 * radio vs MULTIPLE checkboxes). No network, no database — pure functions
 * shared by the product page, add-to-cart, cart render, checkout recalculation
 * and the order snapshot.
 *
 * Guards:
 *   - pre-existing products (no selectionMode) behave exactly as SINGLE,
 *   - MULTIPLE groups: zero-or-more, summed add-ons, required ≥ 1,
 *   - server-side price recalculation stays authoritative (client numbers are
 *     never trusted — the resolver derives the price from live option data),
 *   - cart/order snapshot shapes carry every selected option.
 *
 * Run: npm run check:product-options
 */
import {
  configKey,
  configSnapshot,
  defaultOptionId,
  optionControlKind,
  resolveConfiguredPrice,
  selectionModeOf,
  sumSelectedAddons,
  type OptionGroupLike,
} from "@/lib/catalog/product-options";

const BASE = 1000000; // ₹10,000

// Legacy fixtures: NO selectionMode — must keep working as SINGLE.
const LEGACY: OptionGroupLike[] = [
  {
    id: "g1",
    name: "Case Color",
    required: true,
    enabled: true,
    options: [
      { id: "o1", name: "Black", priceAddon: 0, enabled: true },
      { id: "o2", name: "Brass", priceAddon: 350000, enabled: true },
      { id: "o3", name: "Hidden", priceAddon: 1, enabled: false },
    ],
  },
  {
    id: "g2",
    name: "Foam",
    required: false,
    enabled: true,
    options: [{ id: "o4", name: "Poron", priceAddon: 15000, enabled: true }],
  },
];

// Explicit SINGLE group (matches what the admin editor now saves).
const SINGLE: OptionGroupLike[] = [
  {
    id: "g1",
    name: "Case Color",
    selectionMode: "SINGLE",
    required: true,
    enabled: true,
    options: [
      { id: "o1", name: "Black", priceAddon: 0, enabled: true },
      { id: "o2", name: "Brass", priceAddon: 350000, enabled: true },
    ],
  },
];

// MULTIPLE group — the intended "Accessories" use case.
const MULTIPLE: OptionGroupLike[] = [
  {
    id: "gA",
    name: "Accessories",
    selectionMode: "MULTIPLE",
    required: false,
    enabled: true,
    options: [
      { id: "a1", name: "Carrying Case", priceAddon: 50000, enabled: true },
      { id: "a2", name: "Coiled Cable", priceAddon: 80000, enabled: true },
      { id: "a3", name: "Wrist Rest", priceAddon: 60000, enabled: true },
      { id: "a4", name: "Extra Keycaps", priceAddon: 100000, enabled: true },
      { id: "a5", name: "Disabled", priceAddon: 999999, enabled: false },
    ],
  },
];

const MULTI_BASE = 849900; // ₹8,499

function run() {
  let failed = 0;
  const t = (cond: boolean, tag: string) => {
    if (!cond) {
      console.error(`FAIL: ${tag}`);
      failed++;
      process.exitCode = 1;
    }
  };
  const price = (r: ReturnType<typeof resolveConfiguredPrice>) =>
    r.ok ? r.unitPrice : null;

  // ── SINGLE ────────────────────────────────────────────────────────────────
  // 1. Exactly one selection per group.
  t(
    selectionModeOf({}) === "SINGLE" &&
      selectionModeOf({ selectionMode: "SINGLE" }) === "SINGLE" &&
      selectionModeOf({ selectionMode: "MULTIPLE" }) === "MULTIPLE",
    "mode: absent/legacy and SINGLE both resolve to SINGLE; MULTIPLE to MULTIPLE",
  );
  t(
    optionControlKind({}) === "radio" &&
      optionControlKind({ selectionMode: "SINGLE" }) === "radio" &&
      optionControlKind({ selectionMode: "MULTIPLE" }) === "checkbox",
    "control: SINGLE renders radio, MULTIPLE renders checkbox",
  );
  t(
    price(resolveConfiguredPrice(LEGACY, BASE, ["o2"])) === 1350000,
    "single: one selection resolves base + addon",
  );
  t(
    price(resolveConfiguredPrice(LEGACY, BASE, ["o2", "o4"])) === 1365000,
    "single: one selection per group both resolve",
  );
  t(
    !resolveConfiguredPrice(SINGLE, BASE, ["o1", "o2"]).ok,
    "single: two options in one group rejected",
  );

  // 2. Existing products (legacy, no selectionMode) still work.
  t(
    price(resolveConfiguredPrice(LEGACY, BASE, ["o1"])) === BASE,
    "legacy: base option = base price",
  );
  t(
    price(resolveConfiguredPrice(LEGACY, BASE, ["o1", "o4"])) === 1015000,
    "legacy: required + optional single selections sum",
  );
  t(
    !resolveConfiguredPrice(LEGACY, BASE, []).ok,
    "legacy: required group without a selection rejected",
  );
  t(
    defaultOptionId({ ...SINGLE[0] }) === "o1",
    "legacy: default stays the first zero-addon option",
  );

  // 3. Radio behavior unchanged — never silently allow >1 in a SINGLE group.
  t(
    !resolveConfiguredPrice(SINGLE, BASE, ["o1", "o2"]).ok &&
      !resolveConfiguredPrice(LEGACY, BASE, ["o1", "o2"]).ok &&
      !resolveConfiguredPrice(LEGACY, BASE, ["o3"]).ok,
    "single: multi-select and disabled options rejected",
  );

  // 4. Single add-on price.
  t(
    price(resolveConfiguredPrice(SINGLE, BASE, ["o2"])) === 1350000,
    "single: add-on price applied",
  );

  // ── MULTIPLE ──────────────────────────────────────────────────────────────
  // 5. Multiple options selectable.
  const mTwo = resolveConfiguredPrice(MULTIPLE, MULTI_BASE, ["a2", "a3"]);
  t(
    mTwo.ok && mTwo.unitPrice === 989900 && mTwo.selections.length === 2,
    "multiple: two options in one group accepted and resolved",
  );

  // 6. Zero selections allowed when optional.
  t(
    price(resolveConfiguredPrice(MULTIPLE, MULTI_BASE, [])) === MULTI_BASE,
    "multiple: optional group with no pick = base price",
  );

  // 7. Required MULTIPLE group needs at least one selection.
  const mReq = resolveConfiguredPrice(
    [{ ...MULTIPLE[0], required: true }],
    MULTI_BASE,
    [],
  );
  t(
    !mReq.ok && mReq.error.includes("at least one option"),
    "multiple: required group with zero selections rejected",
  );
  t(
    resolveConfiguredPrice([{ ...MULTIPLE[0], required: true }], MULTI_BASE, [
      "a1",
    ]).ok,
    "multiple: required group with one selection accepted",
  );

  // 8. Multiple add-ons summed.
  t(
    price(resolveConfiguredPrice(MULTIPLE, MULTI_BASE, ["a1", "a2", "a3"])) ===
      1039900,
    "multiple: add-ons summed (500 + 800 + 600)",
  );

  // 9. Unselected options not charged.
  const mOne = resolveConfiguredPrice(MULTIPLE, MULTI_BASE, ["a4"]);
  t(
    mOne.ok && mOne.unitPrice === 949900 && mOne.selections.length === 1,
    "multiple: unselected options contribute nothing",
  );

  // 10. Duplicate option ids rejected.
  t(
    !resolveConfiguredPrice(MULTIPLE, MULTI_BASE, ["a2", "a2"]).ok,
    "multiple: duplicate selection rejected",
  );

  // 11. Unknown option ids rejected.
  t(
    !resolveConfiguredPrice(MULTIPLE, MULTI_BASE, ["no-such-id"]).ok,
    "multiple: unknown option id rejected",
  );

  // 12. Options belonging to another product rejected (not in this product's groups).
  t(
    !resolveConfiguredPrice(MULTIPLE, MULTI_BASE, ["o2"]).ok,
    "multi-vs-single: option from another product's SINGLE group rejected",
  );
  t(
    !resolveConfiguredPrice(SINGLE, BASE, ["a3"]).ok,
    "single-vs-multi: option from another product's MULTIPLE group rejected",
  );

  // 13. Multiple options from the same group accepted.
  t(
    resolveConfiguredPrice(MULTIPLE, MULTI_BASE, ["a1", "a4"]).ok,
    "multiple: several ids from the same group accepted",
  );

  // 14. SINGLE group with multiple selections rejected.
  t(
    !resolveConfiguredPrice(SINGLE, BASE, ["o1", "o2"]).ok &&
      !resolveConfiguredPrice(LEGACY, BASE, ["o2", "o3"]).ok,
    "single: group with two valid selections rejected",
  );

  // 15. Server-side price is authoritative — the resolver derives the price
  //     from live option data; nothing the client sends enters the total.
  const live = resolveConfiguredPrice(
    [{ ...MULTIPLE[0], options: [{ ...MULTIPLE[0].options[0], priceAddon: 9999 }] }],
    MULTI_BASE,
    ["a1"],
  );
  t(
    live.ok && live.unitPrice === MULTI_BASE + 9999,
    "authority: resolver uses the stored/live addon, never the client's number",
  );

  // 16. Cart persistence shape — every selected option lands in optionIds/selections.
  const snap = configSnapshot(
    resolveConfiguredPrice(MULTIPLE, MULTI_BASE, ["a2", "a3"]) as Extract<
      ReturnType<typeof resolveConfiguredPrice>,
      { ok: true }
    >,
  );
  t(
    snap.kind === "options" &&
      snap.optionIds.length === 2 &&
      snap.optionIds.sort().join("|") === "a2|a3" &&
      snap.selections.every(
        (s) => s.groupName === "Accessories" && s.addon > 0 && s.optionName,
      ),
    "cart: snapshot carries both selected options with names + addons",
  );
  t(
    configKey(snap.optionIds) === configKey(["a3", "a2"]),
    "cart: configKey is order-insensitive (identical configs merge)",
  );

  // 17. Order snapshot preserves multiple selections (same snapshot shape →
  //     stored as OrderItem.variantInfo).
  t(
    snap.selections.map((s) => s.optionName).join(",") ===
      "Coiled Cable,Wrist Rest",
    "order: two MULTIPLE selections survive the snapshot verbatim",
  );
  const mixed = configSnapshot(
    resolveConfiguredPrice(
      [...SINGLE, ...MULTIPLE],
      BASE,
      ["o2", "a2", "a3"],
    ) as Extract<ReturnType<typeof resolveConfiguredPrice>, { ok: true }>,
  );
  t(
    mixed.selections.length === 3 &&
      mixed.selections.filter((s) => s.groupName === "Accessories").length === 2,
    "order: one SINGLE + two MULTIPLE selections persist together",
  );

  // ── UI price recomputation ────────────────────────────────────────────────
  const all = [...SINGLE, ...MULTIPLE];
  const priceWith = (ids: string[]) => BASE + sumSelectedAddons(all, ids);
  t(
    priceWith([]) === BASE &&
      priceWith(["a2"]) === 1080000 &&
      priceWith(["a2", "a3"]) === 1140000 &&
      priceWith(["a2", "a3", "a1"]) === 1190000 &&
      priceWith(["o2", "a2", "a3"]) === 1490000,
    "ui: toggling multiple selections recomputes the displayed price (sum)",
  );
  t(
    sumSelectedAddons(all, ["a5"]) === 0 && priceWith(["a5"]) === BASE,
    "ui: disabled option never counts toward the displayed price",
  );

  // ── Backward compatibility ────────────────────────────────────────────────
  // 21. Existing configuration data loads.
  const oldSnap = configSnapshot(
    resolveConfiguredPrice(LEGACY, BASE, ["o2", "o4"]) as Extract<
      ReturnType<typeof resolveConfiguredPrice>,
      { ok: true }
    >,
  );
  t(
    oldSnap.kind === "options" &&
      configKey(oldSnap.optionIds) === configKey(["o2", "o4"]),
    "backcompat: pre-existing snapshot loads and keys correctly",
  );
  t(
    price(resolveConfiguredPrice(LEGACY, BASE, oldSnap.optionIds)) === 1365000,
    "backcompat: stored optionIds re-resolve against live catalog",
  );

  // 22. Products without an explicit selection mode behave as SINGLE.
  const noMode = resolveConfiguredPrice(LEGACY, BASE, ["o1", "o2"]);
  t(
    optionControlKind({}) === "radio" &&
      !noMode.ok &&
      noMode.error.includes("Multiple selections"),
    "backcompat: no selectionMode ⇒ SINGLE radio semantics",
  );

  // 23. Existing cart/order data stays readable.
  t(
    mixed.optionIds.length === 3 &&
      mixed.selections.length === 3 &&
      mixed.selections[0].optionName === "Brass",
    "backcompat: mixed legacy read keeps every selection",
  );

  const msg =
    failed === 0
      ? "ok: all product-options checks passed"
      : `${failed} product-options check(s) FAILED`;
  if (failed === 0) console.log(msg);
  else console.error(msg);
}

if (
  process.argv[1]?.endsWith("catalog/product-options.test.ts") ||
  process.argv[1]?.endsWith("catalog/product-options.test.js")
) {
  run();
}