/**
 * Offline regression suite for the admin `OrderItem.variantInfo` reader.
 *
 * Guards the display path only: `parseVariantInfo` must surface a real snapshot
 * (option groups and product variants) and must fail closed — never throw and
 * never invent a selection — for every malformed/legacy shape.
 *
 * The fixtures are the real shapes written by
 * `src/app/api/payments/create-order/route.ts` (including a live Sofle MX
 * order) plus hostile inputs.
 *
 * Run: npm run check:variant-info
 */
import { parseVariantInfo } from "@/lib/orders/variant-info";

const SOFLE = {
  kind: "options",
  optionIds: ["o1", "o2", "o3"],
  selections: [
    { groupId: "g1", groupName: "Connectivity", optionId: "o1", optionName: "Wireless", addon: 50000 },
    { groupId: "g2", groupName: "Case Color", optionId: "o2", optionName: "Black", addon: 0 },
    { groupId: "g3", groupName: "Accessories", optionId: "o3", optionName: "Tenting", addon: 100000 },
  ],
};

const VARIANT = {
  id: "v1",
  name: "Corne Choc Pro",
  options: { color: "Black", layout: "ISO", legs: 3, bad: null },
};

function run() {
  let failed = 0;
  const t = (cond: boolean, tag: string) => {
    if (!cond) {
      console.error(`FAIL: ${tag}`);
      failed += 1;
    }
  };

  // ── Options snapshot ──────────────────────────────────────────────────────
  const opts = parseVariantInfo(SOFLE);
  t(opts?.kind === "options", "options: recognized");
  t(
    opts?.kind === "options" && opts.selections.length === 3,
    "options: every selection kept",
  );
  t(
    opts?.kind === "options" && opts.selections[0].groupName === "Connectivity",
    "options: group name preserved",
  );
  t(
    opts?.kind === "options" && opts.selections[2].optionName === "Tenting",
    "options: multiple-group selection preserved",
  );

  // Missing optional ids/fields are tolerated, addon defaults to 0.
  const loose = parseVariantInfo({
    kind: "options",
    selections: [{ groupName: "Foam", optionName: "Poron" }],
  });
  t(
    loose?.kind === "options" &&
      loose.selections[0].addon === 0 &&
      loose.selections[0].groupId === "",
    "options: missing ids/addon default safely",
  );

  // Malformed entries are dropped, but a surviving entry still renders.
  const mixed = parseVariantInfo({
    kind: "options",
    selections: [null, "nope", { groupName: "Case", optionName: "Black" }],
  });
  t(
    mixed?.kind === "options" && mixed.selections.length === 1,
    "options: malformed entries dropped",
  );

  // All-malformed / empty selections => null (nothing to show).
  t(
    parseVariantInfo({ kind: "options", selections: [] }) === null,
    "options: empty selections => null",
  );
  t(
    parseVariantInfo({ kind: "options", selections: [null, 1] }) === null,
    "options: no valid selections => null",
  );
  t(
    parseVariantInfo({ kind: "options", selections: "x" }) === null,
    "options: non-array selections => null",
  );

  // ── Product variant snapshot ──────────────────────────────────────────────
  const variant = parseVariantInfo(VARIANT);
  t(
    variant?.kind === "variant" && variant.name === "Corne Choc Pro",
    "variant: name preserved",
  );
  t(
    variant?.kind === "variant" && variant.options.length === 3,
    "variant: only primitive option values kept",
  );
  t(
    variant?.kind === "variant" &&
      variant.options.some((o) => o.key === "legs" && o.value === "3"),
    "variant: numeric option stringified",
  );

  // Variant with no options at all still names the line.
  const bare = parseVariantInfo({ name: "Sofle MX" });
  t(
    bare?.kind === "variant" && bare.options.length === 0,
    "variant: missing options => empty list, still renders",
  );

  // ── Fail-closed on hostile/legacy input ───────────────────────────────────
  t(parseVariantInfo(null) === null, "null => null");
  t(parseVariantInfo(undefined) === null, "undefined => null");
  t(parseVariantInfo("options") === null, "string => null");
  t(parseVariantInfo(42) === null, "number => null");
  t(parseVariantInfo([]) === null, "array => null");
  t(parseVariantInfo({}) === null, "empty object => null");
  t(parseVariantInfo({ kind: "weird" }) === null, "unknown kind => null");
  t(parseVariantInfo({ name: "   " }) === null, "blank name => null");
  t(parseVariantInfo({ latest: "something-else" }) === null, "legacy shape => null");

  const msg =
    failed === 0
      ? "ok: all variant-info checks passed"
      : `${failed} variant-info check(s) FAILED`;
  if (failed === 0) console.log(msg);
  else console.error(msg);
  if (failed > 0) process.exitCode = 1;
}

if (
  process.argv[1]?.endsWith("orders/variant-info.test.ts") ||
  process.argv[1]?.endsWith("orders/variant-info.test.js")
) {
  run();
}
