import assert from "node:assert/strict";
import { resolveProductAddon } from "./product-addon";

const enabled = {
  addonEnabled: true,
  addonTitle: "  Extended Warranty  ",
  addonDescription: "  Six extra months.  ",
  addonPrice: 99900,
};

const cases: Array<[string, boolean]> = [];

function check(name: string, fn: () => void) {
  try {
    fn();
    cases.push([name, true]);
  } catch (error) {
    cases.push([name, false]);
    console.error(`FAIL: ${name}`);
    console.error(error);
  }
}

check("not selected: nothing is charged or snapshotted", () => {
  assert.deepEqual(resolveProductAddon(enabled, false), {
    selected: false,
    title: null,
    description: null,
    price: 0,
  });
});

check("selected: snapshot comes from the product, not the caller", () => {
  assert.deepEqual(resolveProductAddon(enabled, true), {
    selected: true,
    title: "Extended Warranty",
    description: "Six extra months.",
    price: 99900,
  });
});

check("disabled: a crafted selection flag is ignored", () => {
  assert.equal(
    resolveProductAddon({ ...enabled, addonEnabled: false }, true).selected,
    false,
  );
});

check("missing title: a crafted selection flag is ignored", () => {
  assert.equal(
    resolveProductAddon({ ...enabled, addonTitle: "   " }, true).selected,
    false,
  );
});

check("free add-on: price is zero but the selection is valid", () => {
  const resolved = resolveProductAddon({ ...enabled, addonPrice: 0 }, true);
  assert.equal(resolved.selected, true);
  assert.equal(resolved.price, 0);
});

check("invalid negative price: clamped to free", () => {
  const resolved = resolveProductAddon({ ...enabled, addonPrice: -500 }, true);
  assert.equal(resolved.selected, true);
  assert.equal(resolved.price, 0);
});

check("empty description: resolves to null so the UI can hide it", () => {
  assert.equal(
    resolveProductAddon({ ...enabled, addonDescription: "  " }, true)
      .description,
    null,
  );
});

const failed = cases.filter(([, ok]) => !ok);
if (failed.length > 0) process.exit(1);
console.log(`product-addon: ${cases.length} checks passed`);
