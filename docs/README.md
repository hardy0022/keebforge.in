# KeebForge Documentation

Start with [the code map](./code-map.md) for the current file, route, data, and
environment map. The root [README](../README.md) covers local setup and common
commands.

## Architecture

- [Code map](./code-map.md) — authoritative orientation for the current tree.
- [Authorization and RLS snapshot](./architecture/authorization-and-rls.md) —
  enforcement model and open runtime-role verification.
- [Runtime architecture spec](./architecture/keebforge.runtime.json) — canonical
  generated spec, pinned to revision `4f205ddc3048e13057035b362fcd71110be816cd`.
- [Runtime architecture viewer](./architecture/keebforge.runtime.html) —
  generated HTML for the same snapshot.
- Visual-check evidence: `keebforge.runtime.visual-check.{html,json}` and the
  four 1440×900 / 2048×1320 dark/light PNGs.

The runtime architecture files are a snapshot, not a live map; regenerate them
deliberately with `npm run architecture:map` after a tree change is committed.
The visual-check JSON intentionally records a machine-specific absolute artifact
path. It is evidence, not portable source.

## Production

- [Configuration checklist](./production/configuration-checklist.md) — read-only
  production env verification and safety switches.
- [Migration history](./production/migration-history.md) — authoritative
  production ledger, checksums, and replay limits.
- [Launch test matrix](./production/launch-test-matrix.md) — blocking launch
  verification status.

Never apply migrations, alter production settings, or print secret values while
using these documents. Production migration execution is an operator action; the
normal `main` deploy path refuses it.

## Email

- [Resend templates](./resend-templates.md) — template IDs, variables, and
  operational checks.

## Maintenance

- Code map: [docs/code-map.md](./code-map.md)
- Architecture regeneration and generated evidence: [Architecture](#architecture)
- Deployment and environment facts: [Code map §24–25](./code-map.md#24-environment-variables)
