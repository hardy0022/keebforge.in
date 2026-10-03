#!/usr/bin/env node
/**
 * Disposable-database identity check.
 *
 * This script is the pre-flight gate, and it is the one that failed on
 * 2026-10-02: it used `new PrismaClient()`, which honours the datasource `url`
 * only, so it confirmed the scratch database while `prisma migrate deploy`
 * followed `directUrl` to production and applied two migrations there.
 *
 * Two changes close that gap:
 *
 *   1. Before connecting, both `DATABASE_URL` and `DIRECT_URL` must be proven
 *      to describe the same approved loopback scratch database. One variable is
 *      no longer enough, and a disagreement between the two is itself fatal.
 *   2. After connecting, the server is asked what it actually is. A checked
 *      environment variable is not proof of a connected server, so the database
 *      and port the server reports must also match.
 *
 * The connection URL is handed to PrismaClient explicitly rather than left to
 * ambient environment resolution, and nothing here prints a credential — only
 * host, port and database name.
 *
 * Note on structure: this file avoids top-level await. `tsx` transpiles `.ts`
 * to CommonJS in this package, where top-level await is a compile error, so the
 * work lives in `main()` instead.
 *
 * Note on the import: `@prisma/client` is imported dynamically rather than at
 * the top of the file. Importing it has a side effect — it loads `.env` into
 * `process.env`, which repopulates `DATABASE_URL` and `DIRECT_URL` with the
 * production endpoints. Because ES module imports are hoisted and evaluated
 * before any module body runs, a static import would load production
 * credentials into the environment *before* the guard had a chance to inspect
 * the operator's variables, and the guard would then be validating values it
 * never received. Deferring the import keeps `.env` unread on every refusal
 * path, so a refusal genuinely means the operator supplied nothing.
 */
import {
  APPROVED_SCRATCH_DATABASES,
  SCRATCH_PORT,
  ScratchTargetError,
  assertScratchPair,
} from "./scratch-guard";

async function main(): Promise<void> {
  let verified;
  try {
    verified = assertScratchPair({
      databaseUrl: process.env.DATABASE_URL,
      directUrl: process.env.DIRECT_URL,
    });
  } catch (e) {
    if (e instanceof ScratchTargetError) {
      console.error(`REFUSED [${e.code}] ${e.message}`);
      console.error(
        `No connection was made. Scratch targets must be local, port ${SCRATCH_PORT}, ` +
          `and one of: ${APPROVED_SCRATCH_DATABASES.join(", ")}.`,
      );
      process.exit(1);
    }
    throw e;
  }

  const expected = verified.databaseUrl;
  console.log("CONFIG VERIFIED");
  console.log(`  host     ${expected.host}`);
  console.log(`  port     ${expected.port}`);
  console.log(`  database ${expected.database}`);
  console.log("  both DATABASE_URL and DIRECT_URL agree on this target");
  console.log("");

  // Imported only now, once the guard has passed. See the note in the header:
  // this import loads `.env`, and nothing before this line should.
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

  try {
    const rows = (await prisma.$queryRawUnsafe(
    "select current_database() as db, inet_server_addr()::text as addr, " +
      "inet_server_port() as port, version() as version",
  )) as Array<{ db: string; addr: string | null; port: number; version: string }>;

  // Always one row: the functions have no FROM clause.
  const row = rows[0];

    // The connected server must agree with the configuration that was checked.
    // Either half alone is insufficient — that is the whole lesson of this batch.
    if (row.db !== expected.database) {
      console.error(
        `REFUSED [SERVER_MISMATCH] connected to database "${row.db}" but ` +
          `"${expected.database}" was verified. No further commands were run.`,
      );
      process.exit(1);
    }
    if (String(row.port) !== expected.port) {
      console.error(
        `REFUSED [SERVER_PORT_MISMATCH] the connected server reports port ${row.port} but ` +
          `${expected.port} was verified. No further commands were run.`,
      );
      process.exit(1);
    }

    console.log("SERVER CONFIRMED");
    console.log(`  database       ${row.db}`);
    console.log(`  port           ${row.port}`);
    console.log(`  server address ${row.addr ?? "(unix socket)"}`);
    console.log(`  ${String(row.version).split(" ").slice(0, 2).join(" ")}`);
    console.log("");
    console.log(JSON.stringify({ ok: true, db: row.db, host: row.addr, port: row.port }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});