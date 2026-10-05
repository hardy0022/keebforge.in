-- Scratch-only Supabase auth compatibility shim.
--
-- WHY THIS EXISTS
--
-- Migration 20260819150000_rls_defense_in_depth creates 26 RLS policies, 16 of
-- which call auth.uid() or auth.jwt(). PostgreSQL resolves function calls while
-- it parses the CREATE POLICY statement, so on a vanilla postgres:16-alpine
-- container — which has no `auth` schema — that migration fails before it can
-- create a single policy. It is migration 2 of 41, so the whole from-empty
-- replay stops there.
--
-- On Supabase those functions are supplied by the platform. This file supplies
-- them for the disposable scratch database only.
--
-- THIS IS NOT A MIGRATION
--
-- Deliberately outside prisma/migrations/, and deliberately never a
-- prisma/migrations/<timestamp>_*/migration.sql entry. Adding it to the history
-- would mean `prisma migrate deploy` runs `CREATE OR REPLACE FUNCTION auth.uid()`
-- against production too, where that same signature silently replaces the
-- genuine platform function with this stub. That is an auth downgrade with no
-- error, which is why it is a separate, explicitly invoked, guarded step.
--
-- The 41 existing migration files stay byte-identical, so replaying them here
-- remains a faithful rehearsal of the production history.
--
-- WHAT THE POLICIES ACTUALLY NEED
--
--   auth.uid()::text              16 uses — must return a type castable to text
--   auth.jwt() ->> 'email'         1 use  — must return json/jsonb for `->>`
--
-- The return types below (uuid and jsonb) are Supabase's own, and both satisfy
-- those expressions.
--
-- IDEMPOTENCE
--
-- CREATE SCHEMA IF NOT EXISTS plus CREATE OR REPLACE FUNCTION on both
-- definitions make every statement re-runnable with no error and no duplicate
-- object. Grants are likewise re-runnable.
--
-- BEHAVIOUR NOTES
--
-- `missing_ok => true` means current_setting returns NULL when the GUC is unset
-- rather than raising, so both functions are safe to call in any session. COALESCE
-- turns that into '{}' / NULL, so a policy evaluates to NULL — which is not true
-- — and therefore DENIES. No session can accidentally be granted access by
-- omitting the claim.
--
-- auth.uid() raises on a `sub` that is present but not a UUID. That is faithful
-- to Supabase and is deliberate: a malformed claim should be loud, not silently
-- coerced. Note that these policies can never grant anything in this project
-- anyway — Profile.id and every profileId are better-auth cuids, while
-- auth.uid() yields a Supabase UUID. Tracked as a separate follow-up.
--
-- SET search_path = '' pins resolution to pg_catalog, so a caller cannot alter
-- these definitions' behaviour through its own search_path. Schema-qualified
-- references such as auth.jwt() resolve regardless.

CREATE SCHEMA IF NOT EXISTS auth;

-- Supabase-shaped JWT accessor. Returns the parsed `request.jwt.claims` session
-- GUC, or an empty object when it is unset.
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path = ''
  AS $$
    SELECT COALESCE(
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
      '{}'::jsonb
    )
  $$;

-- Supabase-shaped subject accessor. Reads `sub` out of the JWT, or NULL when
-- there is no claim, which makes every RLS policy that uses it deny.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql
  STABLE
  SET search_path = ''
  AS $$
    SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid
  $$;

-- A newly created schema grants no privileges to PUBLIC, so a non-owner role
-- cannot even resolve `auth.uid` without these. The migration itself does not
-- need them: the table-owner/superuser role the harness uses bypasses
-- privilege checks at parse time. They exist so the optional non-owner RLS
-- probe has something to exercise.
GRANT USAGE ON SCHEMA auth TO PUBLIC;

GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid() TO PUBLIC;