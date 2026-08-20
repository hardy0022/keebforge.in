# KeebForge.in

Production website for a Bangalore-based mechanical-keyboard repair & custom-build business. Rebuilt from scratch on Next.js 16 (App Router) — database-driven, server-first.

**Read `memory/` first** — it explains the project's scope, decisions, completed work, and known gotchas. Start at [`memory/README.md`](memory/README.md).

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · Prisma → Supabase PostgreSQL · Better Auth · Resend · Cloudinary (pending) · Razorpay (Phase 6)

## Commands

```bash
npm run dev        # dev server on :3000
npm run build      # production build (run before finishing work)
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm run db:deploy  # apply migrations (never use `migrate dev` — see memory/03-database.md)
npm run db:seed    # idempotent seed
```

See `memory/09-env-ops.md` for the full workflow and environment requirements. `memory/10-gotchas.md` lists traps that will save you real debugging time.