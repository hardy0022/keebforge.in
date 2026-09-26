#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ARCHIFY =
  process.env.ARCHIFY_BIN ??
  join(process.env.HOME ?? "", ".claude/skills/archify/bin/archify.mjs");
const SPEC = join(ROOT, "docs/architecture/keebforge.runtime.json");
const VIEWER = join(ROOT, "docs/architecture/keebforge.runtime.html");
const VISITOR = join(ROOT, "public/architecture.html");
const args = [
  "deliver",
  "architecture",
  SPEC,
  VIEWER,
  "--quality",
  "showcase",
  "--repo-root",
  ROOT,
  "--json",
];

console.log(`> node ${ARCHIFY} ${args.slice(0, 3).join(" ")} ...`);

let output;
try {
  output = execFileSync("node", [ARCHIFY, ...args], { encoding: "utf8" });
} catch (error) {
  const raw = (error.stdout ?? error.stderr ?? "").toString();
  const start = raw.indexOf("{");
  try {
    const receipt = JSON.parse(raw.slice(start));
    for (const diagnostic of receipt.diagnostics ?? []) {
      console.error(`- [${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`);
    }
  } catch {
    console.error(raw.slice(0, 4000));
  }
  process.exit(1);
}

const receipt = JSON.parse(output);
const spec = JSON.parse(readFileSync(SPEC, "utf8"));
copyFileSync(VIEWER, VISITOR);

const artifact = receipt.artifact ?? receipt;
console.log(
  `\nOK — ${spec.components.length} nodes, ${spec.connections.length} connections, ${spec.meta.views.length} guided views`,
);
for (const key of ["specificationSha256", "artifactSha256", "specBytes", "artifactBytes"]) {
  if (artifact[key] !== undefined) console.log(`  ${key}: ${artifact[key]}`);
}
console.log("\nWrote:\n  docs/architecture/keebforge.runtime.html\n  public/architecture.html");
