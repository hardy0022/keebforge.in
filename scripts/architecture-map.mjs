#!/usr/bin/env node
// Generates the interactive KeebForge architecture map FROM the README's
// `architecture:` YAML block (single source of truth). Layout geometry
// (coordinates are presentation, not architecture info) is auto-computed as
// a row-per-group grid; the resolved archify spec and the interactive HTML
// are derived artifacts.
//
//   npm run architecture:map
//
// Writes:
//   docs/architecture/keebforge.runtime.architecture.json  (derived spec)
//   docs/architecture/keebforge.runtime.html               (canonical viewer)
//   public/architecture.html                               (served copy)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const README = join(ROOT, "README.md");
const ARCHIFY =
  process.env.ARCHIFY_BIN ??
  join(process.env.HOME ?? "", ".claude/skills/archify/bin/archify.mjs");
const SPEC = "docs/architecture/keebforge.runtime.architecture.json";
const VIEWER = "docs/architecture/keebforge.runtime.html";
const VISITOR = "public/architecture.html";

// Grid geometry — row-per-group, left-aligned bands, standard 120x60 node
// boxes (archify default) so the canvas stays within desktop-readable width.
const ORIGIN = [40, 180];
const CELL = { w: 120, h: 52 };
const GAP = { x: 24, y: 110 };

const md = readFileSync(README, "utf8");
const start = md.indexOf("```yaml");
const end = start < 0 ? -1 : md.indexOf("```", start + 7);
if (start < 0 || end < 0) {
  throw new Error("README.md has no ```yaml architecture block");
}
const block = md.slice(start + 7, end);
const arch = yaml.load(block);
if (!arch?.architecture) throw new Error("No `architecture:` key in the block");

const a = arch.architecture;
const groups = a.groups ?? [];
if (!Array.isArray(groups) || groups.length === 0) throw new Error("No groups");
const nodeIds = (g) => (g.nodes ?? []).map((n) => n.id);

const maxCols = Math.max(...groups.map((g) => nodeIds(g).length));
const componentType = new Set([
  "frontend", "backend", "database", "cloud", "security", "messagebus", "external",
]);

const components = [];
for (const g of groups) {
  for (const [i, n] of (g.nodes ?? []).entries()) {
    if (!componentType.has(n.type)) throw new Error(`node ${n.id}: bad type ${n.type}`);
    // Left-aligned bands: every band shares the same column indices, so
    // cross-band edges can drop through straight vertical lanes and the
    // inter-row gaps leave routing gutters (deterministic, no hand pixels).
    // A node may pin its column explicitly (`col:`); default = order in group.
    const comp = {
      id: n.id,
      type: n.type,
      label: n.label,
      row: groups.indexOf(g) + 1,
      col: Number.isInteger(n.col) ? n.col : i,
    };
    if (n.sublabel) comp.sublabel = n.sublabel;
    if (n.tag) comp.tag = n.tag;
    components.push(comp);
  }
}

const boundaries = groups
  .filter((g) => nodeIds(g).length > 0)
  .map((g) => ({
    kind: g.kind === "security" ? "security-group" : "region",
    label: g.name,
    wraps: nodeIds(g),
  }));

// --- Grid math -------------------------------------------------------------
// (Mirrors the `layout` block below; box height is renderer-default 60.)
const stepX = CELL.w + GAP.x;
const stepY = CELL.h + GAP.y;
const posOf = (c) =>
  [ORIGIN[0] + c.col * stepX, ORIGIN[1] + c.row * stepY];
const byId = new Map(components.map((c) => [c.id, c]));

// The auto router sometimes funnels two same-column verticals through one
// shared gutter lane. Pin such edges to their own column center with two
// via points (derived from the grid, so no hand pixels) to keep them apart.
const connections = (a.connections ?? []).map((conn) => {
  const from = byId.get(conn.from);
  const to = byId.get(conn.to);
  if (from && to && from.col === to.col && from.row !== to.row) {
    const [fx, fy] = posOf(from);
    const [, ty] = posOf(to);
    const cx = fx + CELL.w / 2;
    const fromBottom = fy + 60;
    const span = Math.abs(ty - fromBottom);
    const via = [
      [cx, Math.round(fromBottom + span / 3)],
      [cx, Math.round(ty - span / 3)],
    ];
    return { ...conn, via };
  }
  return conn;
});

const spec = {
  schema_version: 1,
  diagram_type: "architecture",
  meta: {
    title: a.meta?.title ?? "KeebForge Platform Architecture",
    locale: "en",
    quality_profile: "showcase",
    ...(a.meta?.output ? { output: a.meta.output } : {}),
    ...(Array.isArray(a.views) && a.views.length ? { views: a.views } : {}),
  },
layout: {
    mode: "grid",
    origin: ORIGIN,
    cols: maxCols,
    cellW: CELL.w,
    cellH: CELL.h,
    gapX: GAP.x,
    gapY: GAP.y,
  },
  components,
  boundaries,
  connections,
  ...(Array.isArray(a.cards) && a.cards.length ? { cards: a.cards } : {}),
};

const specPath = join(tmpdir(), "keebforge-architecture.json");
writeFileSync(specPath, JSON.stringify(spec, null, 2));

const viewerPath = join(ROOT, VIEWER);
mkdirSync(dirname(viewerPath), { recursive: true });
const args = ["deliver", "architecture", specPath, viewerPath, "--quality", "showcase", "--json"];
console.log(`> node ${ARCHIFY} ${args.slice(0, 3).join(" ")} ...`);
let receipt;
try {
  receipt = execFileSync("node", [ARCHIFY, ...args], { encoding: "utf8" });
} catch (err) {
  const raw = (err.stdout ?? err.stderr ?? "").toString();
  const at = raw.indexOf("{");
  try {
    const parsed = JSON.parse(raw.slice(at));
    for (const d of parsed.diagnostics ?? []) {
      console.error(`- [${d.severity}] ${d.code}: ${d.message}`);
    }
  } catch {
    console.error(raw.slice(0, 4000));
  }
  process.exit(1);
}
const parsed = JSON.parse(receipt);

writeFileSync(join(ROOT, SPEC), JSON.stringify(spec, null, 2));
copyFileSync(viewerPath, join(ROOT, VISITOR));

const r = parsed.artifact ?? parsed;
console.log(`\nOK — ${maxCols} columns, ${components.length} nodes, ${(a.connections ?? []).length} connections`);
for (const k of ["specificationSha256", "artifactSha256", "specBytes", "artifactBytes"]) {
  if (r[k] !== undefined) console.log(`  ${k}: ${r[k]}`);
}
console.log(`\nWrote:\n  ${SPEC}\n  ${VIEWER}\n  ${VISITOR}`);