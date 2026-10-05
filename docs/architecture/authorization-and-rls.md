# Authorization and RLS Model

## Identity model
- Better Auth is used for authentication.
- Profile/User IDs in the application are CUIDs (see `prisma/schema.prisma`).
- Supabase `auth.uid()` returns a UUID. This is a semantic mismatch; policies that reference `auth.uid()` cannot be directly mapped to CUID-based identities without an explicit identity mapping strategy.

## Data access boundary
- Application data access is primarily through Prisma (server-side). Server actions and route handlers enforce authorization.
- Permission model: `requirePermission(resource, action)` with role checks (see admin/auth code). Layout guard plus per-action checks are the enforcement boundary.
- No application code paths that rely on PostgREST/Supabase REST for privileged operations were identified in the reviewed source; this must be treated as the current assumption until verified.

## Server-side authorization
- Admin/staff/developer roles are defined in the auth model.
- Critical operations (e.g. order deletion) enforce permission checks and business rules (refund evidence preservation).
- Client-supplied authorization is never trusted; all sensitive operations validated server-side.

## PostgreSQL RLS behavior (important)
- RLS is enabled on many tables. 
- For roles **subject to RLS** with **zero policies**, PostgreSQL applies default-deny (those roles see 0 rows for affected operations). Grants do not override RLS.
- **Table owners** bypass RLS unless `FORCE ROW LEVEL SECURITY` is true.
- **Superusers** and roles with `BYPASSRLS` bypass RLS.
- `FORCE ROW LEVEL SECURITY` is false for the inspected tables; table owner is `postgres` in the observed state.
- Observed state: many tables have RLS enabled with zero policies. Whether RLS is actively enforced depends on the **runtime database role** used by the application.

## Runtime role (UNVERIFIED)
- The runtime PostgreSQL role used by the deployed application has **not been positively identified** from catalogs/templates alone.
- Connection observed as `postgres` in ad-hoc read-only checks; multiple roles exist in production (authenticator, service_role, anon, authenticated, supabase_*). 
- The effective role depends on deployment configuration (pooler/connection string credentials) and Supabase setup. This must be verified via separately authorized deployment configuration review.

## RLS policy implications
- If the runtime role is owner or has BYPASSRLS, RLS is not enforced by DB — authorization relies on Prisma/server checks.
- If the runtime role is non-bypass and subject to RLS, zero-policy state means access is denied; enabling policies requires solving CUID/UUID identity mapping and designing minimal correct policies.
- Defense-in-depth via RLS is only meaningful if: (1) runtime role is non-bypass, (2) intended policies exist and are correct, (3) identity mapping is resolved.

## Policy stance
- Treat Prisma + server-side permission checks as the **authoritative enforcement boundary** until runtime role and policy model are explicitly established.
- Do not assume RLS is effective. Document any future move to PostgREST/REST as requiring policy design.
