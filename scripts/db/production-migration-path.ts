/**
 * Production migration path — INTENTIONALLY NOT EXECUTABLE.
 *
 * Batch 5C.3 replaced `db:deploy` (bare `prisma migrate deploy`) with a refusal,
 * because that script follows `DIRECT_URL` out of `.env`. `DIRECT_URL` points at
 * the production Supabase direct endpoint, so the command that looked like a
 * deployment tool was equally a way to write to production by accident — which
 * is exactly how two migrations reached production on 2026-10-02.
 *
 * Before this module existed, the deployment procedure was not documented
 * anywhere in the repository. Investigation found:
 *
 *   - `db:deploy` has no callers. There is no `.github` directory, no CI
 *     workflow, no Vercel `buildCommand`/`installCommand`/`postBuild`, and no
 *     documentation referencing it. It was a manual `npm run` script only.
 *   - `postinstall` runs `prisma generate`, which is offline and cannot connect.
 *   - `vercel.json` contains only `{"regions": ["bom1"]}`.
 *
 * So how production migrations are actually applied today is unknown from the
 * repository alone. Vercel project settings are not visible here and are not
 * assumed. Guessing at that mechanism and writing a command that mutates
 * production on the strength of a guess is precisely the class of error this
 * batch exists to prevent.
 *
 * Therefore this module does one thing: state that no verified production
 * migration path exists, and refuse. It is deliberately inert.
 *
 * What a future production path must satisfy before it is enabled:
 *
 *   1. An identified, documented production mechanism. The current one has to be
 *      discovered and recorded, not inferred.
 *   2. A target that is stated explicitly per run and verified to be the
 *      intended production instance, rather than inherited from `.env`. This is
 *      the specific failure that caused the incident: the value was ambient.
 *   3. An independent review of the migrations about to be applied, plus a
 *      read-only preflight (`dbcheck`-style confirmation of what the target
 *      actually is) before anything is written.
 *   4. Confirmation that does not live in the repository. A phrase committed
 *      alongside the command it guards is not a confirmation mechanism.
 *
 * Those are requirements, not a queue of pending work, and this file
 * deliberately stops short of implementing them.
 */

export type ProductionPlan =
  | { ok: false; code: string; message: string }
  | { ok: true; target: unknown; command: string; args: string[] };

/**
 * Always refuses, unconditionally.
 *
 * It takes no arguments on purpose. A signature accepting an approval flag or a
 * confirmation string invites a future caller to pass one and expect it to work;
 * taking no input at all means enabling this path is necessarily an edit to this
 * function, which is the deliberate review point.
 */
export function planProductionDeploy(): ProductionPlan {
  return {
    ok: false,
    code: "PRODUCTION_PATH_NOT_ENABLED",
    message:
      "No verified production migration path is available, so this command cannot run. " +
      "Applying migrations to production requires a documented mechanism with an explicit, " +
      "non-.env-derived target and an out-of-band confirmation. Neither exists in this repository, " +
      "and inventing one here is the risk this batch was created to remove. " +
      "To validate migrations, use the disposable scratch database: " +
      "npm run db:scratch:deploy -- --database keebforge_e2e_fresh",
  };
}