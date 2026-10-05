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
 *      name the server reports must match, and the address it reports must be a
 *      local one.
 *
 * WHAT THE SERVER REPORTS, AND WHY IT IS NOT WHAT YOU DIALLED
 *
 * `inet_server_addr()` returns the address of the *server's* socket. When the
 * scratch container publishes `127.0.0.1:55432` to `5432` inside itself, a
 * connection that is provably loopback from the host is presented to the server
 * as the container's bridge address (`172.17.0.2`), and `inet_server_port()`
 * returns the container's `5432`. Neither value can equal the `127.0.0.1:55432`
 * that was verified, so an earlier version of this file compared them and
 * refused `SERVER_PORT_MISMATCH` on a perfectly correct connection. Equality
 * there is unsatisfiable, not strict.
 *
 * Each of the two is therefore checked against the value that is actually
 * correct for it. The address is judged on locality: a loopback or
 * private-network address is accepted, and anything routable — which is what a
 * managed production instance looks like — is refused. The port is held to
 * `SERVER_SIDE_PORT`, the port PostgreSQL actually listens on inside the
 * container, which is a check that can genuinely fail and so catches a
 * connection that landed somewhere other than the disposable database.
 *
 * `inet_server_addr()` is an `inet`, so PostgreSQL always renders it in CIDR form
 * — `172.17.0.2/32`, never a bare address. The prefix is split off and range
 * checked against the family's own limit before the address is judged, IPv4-
 * mapped forms such as `::ffff:172.17.0.2` are resolved to the IPv4 address they
 * stand for, and a malformed address or prefix is `remote`. Anything this
 * function cannot confidently place is refused, so the failure direction is
 * always towards refusing.
 *
 * The loopback *binding* is a property of the host's network stack and cannot be
 * observed from inside a session at all; it is established by the container's
 * published port and checked there with `docker port` and `ss`, not here. What
 * this file does assert about the host side is the URL, via `assertScratchPair`:
 * a loopback literal and the published port, with no fallback to `.env`.
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
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * How a server-reported address relates to this machine.
 *
 * `loopback`      a literal loopback address, so no forwarding is in play.
 * `local-network` a private or link-local address, which is what a
 *                 loopback-published container presents on its bridge.
 * `remote`        routable, and so somewhere this machine demonstrably is not.
 * `absent`        no address at all, i.e. a Unix socket rather than the TCP
 *                 connection the verified URL describes.
 */
export type ServerAddressClass = "loopback" | "local-network" | "remote" | "absent";

/**
 * Strict dotted-quad.
 *
 * Each octet is `0` or a digit string with no leading zero, which is what every
 * conforming parser accepts. Leading zeros are refused deliberately: `010.0.0.1`
 * is `10.0.0.1` read as decimal and `8.0.0.1` read as octal, so a lenient parser
 * can call the same string local or routable depending on who reads it. Rejecting
 * the ambiguous form removes that whole class rather than picking a side.
 */
function parseIpv4(addr: string): [number, number, number, number] | null {
  const m = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/.exec(addr);
  if (!m) return null;
  const parts = m.slice(1, 5).map(Number) as [number, number, number, number];
  return parts.every((n) => n >= 0 && n <= 255) ? parts : null;
}

/**
 * Split an address from its optional CIDR prefix.
 *
 * `inet_server_addr()` is of type `inet`, so PostgreSQL renders it in CIDR form
 * and always includes the prefix — a bare `172.17.0.2` is not what this harness
 * ever receives. Parsing has to account for that, and it has to fail closed: a
 * malformed prefix makes the whole value unclassifiable, and unclassifiable must
 * never mean "local".
 *
 * Returns `null` for anything malformed, including a second slash, a missing or
 * non-numeric prefix, and a zero-padded one (`/032` is not a prefix PostgreSQL
 * would emit, and accepting it would widen what parses).
 */
function splitCidr(addr: string): { host: string; prefix: number | null } | null {
  const at = addr.indexOf("/");
  if (at === -1) return { host: addr, prefix: null };
  if (addr.indexOf("/", at + 1) !== -1) return null;

  const host = addr.slice(0, at);
  const prefixText = addr.slice(at + 1);
  if (host === "" || !/^(0|[1-9]\d{0,2})$/.test(prefixText)) return null;

  return { host, prefix: Number(prefixText) };
}

/**
 * Enough IPv6 syntax to reject junk without writing a full parser.
 *
 * Groups are 1–4 hex digits, a single `::` is allowed, and a dotted-quad is only
 * legal as the final group. Anything that slips through here is still classified
 * by `classifyIpv6`, whose default is `remote`, so a permissive check cannot
 * turn into a permissive verdict.
 */
function looksIpv6(host: string): boolean {
  if (!host.includes(":")) return false;
  // `::` stands for one or more zero groups and may appear at most once. Counting
  // occurrences of "::" is not enough: it matches non-overlapping, so a triple
  // colon counts once and would slip past, hence the explicit run check.
  if (host.includes(":::")) return false;
  const compressed = host.includes("::");
  if (compressed && (host.match(/::/g) ?? []).length > 1) return false;
  // A single colon may never open or close an address; only `::` may. Without
  // this, a trailing colon such as `fd00::1:` parses as a plausible ULA.
  if (host.startsWith(":") && !host.startsWith("::")) return false;
  if (host.endsWith(":") && !host.endsWith("::")) return false;

  const segments = host.split(":");
  const groups = segments.filter((s) => s !== "");

  // A full address is 8 groups. `::` stands in for one or more of them, so with
  // compression up to 7 explicit groups are legal and without it there must be
  // exactly 8. Without this a truncated form such as `fe80:1` is a syntactically
  // plausible link-local and would be accepted as local.
  if (compressed ? groups.length > 7 : groups.length !== 8) return false;
  // An empty segment only ever comes from compression; `:1:2:...` is malformed.
  if (!compressed && segments.some((s) => s === "")) return false;

  return segments.every((segment, i) => {
    if (segment === "") return true;
    if (segment.includes(".")) return i === segments.length - 1 && parseIpv4(segment) !== null;
    return /^[0-9a-f]{1,4}$/.test(segment);
  });
}

function classifyIpv4(octets: [number, number, number, number]): ServerAddressClass {
  const [a0, a1] = octets;
  if (a0 === 127) return "loopback";
  if (a0 === 10) return "local-network";
  if (a0 === 172 && a1 >= 16 && a1 <= 31) return "local-network";
  if (a0 === 192 && a1 === 168) return "local-network";
  if (a0 === 169 && a1 === 254) return "local-network";
  return "remote";
}

function classifyIpv6(host: string): ServerAddressClass {
  if (host === "::1") return "loopback";

  // An IPv4-mapped address is the IPv4 address wearing an IPv6 hat; it must be
  // judged by the same rules, or `::ffff:8.8.8.8` would slip past as "local".
  const mapped = /^::ffff:(.+)$/.exec(host);
  if (mapped) {
    const rest = mapped[1];
    const dotted = parseIpv4(rest);
    if (dotted) return classifyIpv4(dotted);
    const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(rest);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return classifyIpv4([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]);
    }
    return "remote";
  }

  if (/^f[cd][0-9a-f]{2}:/.test(host)) return "local-network";
  if (/^fe[89ab][0-9a-f]:/.test(host)) return "local-network";

  return "remote";
}

export function classifyServerAddress(addr: string | null | undefined): ServerAddressClass {
  if (addr === null || addr === undefined) return "absent";
  const a = String(addr).trim().toLowerCase();
  if (a === "") return "absent";

  const split = splitCidr(a);
  if (split === null) return "remote";

  const { host, prefix } = split;

  const v4 = parseIpv4(host);
  if (v4) {
    // Range-checked against the family's own limit before the address is judged.
    if (prefix !== null && prefix > 32) return "remote";
    return classifyIpv4(v4);
  }

  if (!looksIpv6(host)) return "remote";
  if (prefix !== null && prefix > 128) return "remote";

  return classifyIpv6(host);
}

export type ConnectedServer = {
  database: string;
  serverAddress: string | null;
  serverPort: number;
};

export type ServerCheck =
  | { ok: true; classification: ServerAddressClass }
  | { ok: false; code: string; message: string };

/**
 * The port PostgreSQL listens on *inside* the scratch container.
 *
 * This is deliberately not `SCRATCH_PORT`. The two answer different questions:
 *
 *   SERVER_SIDE_PORT (5432)  what `inet_server_port()` reports — the socket on
 *                            the far side of the forward, inside the container.
 *   SCRATCH_PORT     (55432) what the host publishes, and therefore what the
 *                            connection URL is validated against before any
 *                            connection is attempted.
 *
 * Asserting `SCRATCH_PORT` against the server-reported port is unsatisfiable,
 * and asserting nothing but plausibility is too weak: it would accept a
 * connection that landed on any other local service. Each is checked against the
 * value that is actually correct for it, and never against the other.
 */
export const SERVER_SIDE_PORT = 5432;

/**
 * Decide whether the server that answered is the disposable local one.
 *
 * Pure, and taking only the values a caller already has, so the entire
 * post-connection gate is unit tested without a database in the room.
 */
export function checkConnectedServer(
  reported: ConnectedServer,
  expected: { database: string; publishedPort: string },
): ServerCheck {
  if (reported.database !== expected.database) {
    return {
      ok: false,
      code: "SERVER_MISMATCH",
      message:
        `connected to database "${reported.database}" but "${expected.database}" was verified`,
    };
  }

  const classification = classifyServerAddress(reported.serverAddress);
  if (classification === "remote") {
    return {
      ok: false,
      code: "SERVER_REMOTE_ADDRESS",
      message:
        `the connected server reports address ${reported.serverAddress}, which is routable. ` +
        `Refusing: the verified URL dials a loopback address, so the far end of that connection ` +
        `must also be on this machine, and a managed production instance is not.`,
    };
  }
  if (classification === "absent") {
    return {
      ok: false,
      code: "SERVER_ADDRESS_UNKNOWN",
      message:
        `the connected server reports no address. Refusing: the verified URL dials port ` +
        `${expected.publishedPort} over TCP, so a Unix socket is not the connection that was approved.`,
    };
  }

  // The two ports are checked against their own values and never against each
  // other. `expected.publishedPort` is validated as part of the URL by
  // `assertScratchPair` before a connection is attempted, and the exclusive
  // loopback binding of the published socket is a property of the host's network
  // stack that this session cannot observe at all — it is established by the
  // container's published port and checked with `docker port` and `ss`.
  // `inet_server_port()` reports the container's own port, so it is held to
  // SERVER_SIDE_PORT, which is a check that can actually fail.
  if (!Number.isFinite(reported.serverPort) || !Number.isInteger(reported.serverPort)) {
    return {
      ok: false,
      code: "SERVER_PORT_INVALID",
      message: `the connected server reports an unusable port ${reported.serverPort}. Refusing.`,
    };
  }
  if (reported.serverPort !== SERVER_SIDE_PORT) {
    return {
      ok: false,
      code: "SERVER_PORT_MISMATCH",
      message:
        `the connected server reports port ${reported.serverPort}, not PostgreSQL's listening ` +
        `port ${SERVER_SIDE_PORT} inside the container. Refusing. Note that ` +
        `${expected.publishedPort} is the host-published port and is deliberately not compared ` +
        `here: a forwarded connection legitimately reports ${SERVER_SIDE_PORT}.`,
    };
  }

  return { ok: true, classification };
}

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
    const check = checkConnectedServer(
      { database: row.db, serverAddress: row.addr, serverPort: Number(row.port) },
      { database: expected.database, publishedPort: expected.port },
    );
if (!check.ok) {
    // Messages are sentences in their own right; strip the full stop so joining
    // them here cannot produce ".." .
    const detail = check.message.replace(/\.$/, "");
    console.error(`REFUSED [${check.code}] ${detail}. No further commands were run.`);
    process.exit(1);
  }

    console.log("SERVER CONFIRMED");
    console.log(`  database       ${row.db}`);
    console.log(`  published port ${expected.port} (verified on the connection URL)`);
    console.log(`  server port    ${row.port} (the container's own socket, after forwarding)`);
    console.log(`  server address ${row.addr ?? "(none)"} — ${check.classification}`);
    console.log(`  ${String(row.version).split(" ").slice(0, 2).join(" ")}`);
    console.log("");
    console.log(
      JSON.stringify({
        ok: true,
        db: row.db,
        host: row.addr,
        port: row.port,
        classification: check.classification,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Whether this file is the script being executed.
 *
 * The checks in this file are pure and unit tested, so importing it must not
 * open a connection. `import.meta.url` is this module's own URL and only equals
 * the entry script's URL when this file is what was actually run.
 *
 * A false negative here would make the gate silently do nothing, so the test
 * suite pins the guard's presence and the refusal path is exercised directly.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}