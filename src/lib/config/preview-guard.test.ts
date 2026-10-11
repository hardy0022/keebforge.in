import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import {
  PREVIEW_DATABASE_TARGETS_ENV,
  PREVIEW_OPERATIONS_ENV,
  PreviewGuardError,
  assertPreviewDatabaseTarget,
  deploymentEnvironment,
  parseDatabaseTarget,
  parsePreviewAllowlist,
  resolveOperationsAllowed,
  targetApproved,
} from "@/lib/config/preview-guard";

/**
 * Preview-deployment isolation guard.
 *
 * Part A exercises the pure core with injected values — every branch, no
 * database, no network. Part B exercises the server-only wrapper that reads the
 * real `process.env` (with `server-only` stubbed, as Next.js supplies it).
 * Part C pins the Prisma wiring so the guard provably runs before a client is
 * constructed.
 *
 * The scenarios required by the task:
 *   1. VERCEL_ENV=preview with missing configuration      → refused
 *   2. Production database target in Preview              → refused
 *   3. Unknown target in Preview                          → refused
 *   4. Explicitly approved Preview target                 → allowed
 *   5. Local development behavior                         → unenforced
 *   6. Production behavior                                → unenforced
 */

const APPROVED = "preview-db.internal.example.com:5432/keebforge_preview";
const APPROVED_URL =
  "postgresql://preview_user:secret@preview-db.internal.example.com:5432/keebforge_preview";
const OTHER_URL =
  "postgresql://someone:secret@db.unknown-host.example.net:5432/keebforge_preview";
const PRODUCTION_URL =
  "postgresql://postgres:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof PreviewGuardError, `expected PreviewGuardError, got ${e}`);
    return e.code;
  }
  throw new Error("expected the guard to throw, but it returned");
}

(async () => {
  let n = 0;
  const pass = (msg: string) => {
    n += 1;
    console.log(`PASS ${String(n).padStart(2, "0")} ${msg}`);
  };

  // ── Enum mapping ───────────────────────────────────────────────────────────
  assert.equal(deploymentEnvironment("preview"), "preview");
  assert.equal(deploymentEnvironment("production"), "production");
  assert.equal(deploymentEnvironment("development"), "local");
  assert.equal(deploymentEnvironment(undefined), "local");
  assert.equal(deploymentEnvironment(""), "local");
  assert.equal(deploymentEnvironment(" Preview "), "preview");
  assert.equal(deploymentEnvironment("staging"), "unknown");
  assert.equal(deploymentEnvironment("preview2"), "unknown");
  pass("VERCEL_ENV maps to preview / production / local / unknown");

  // ── 1. Preview with missing / malformed configuration ──────────────────────
  assert.equal(
    codeOf(() =>
      assertPreviewDatabaseTarget({
        vercelEnv: "preview",
        databaseUrl: undefined,
        allowlist: APPROVED,
      }),
    ),
    "MISSING_DATABASE_URL",
    "missing DATABASE_URL must refuse in preview",
  );
  assert.equal(
    codeOf(() =>
      assertPreviewDatabaseTarget({
        vercelEnv: "preview",
        databaseUrl: "   ",
        allowlist: APPROVED,
      }),
    ),
    "MISSING_DATABASE_URL",
    "blank DATABASE_URL must refuse in preview",
  );
  assert.equal(
    codeOf(() =>
      assertPreviewDatabaseTarget({
        vercelEnv: "preview",
        databaseUrl: APPROVED_URL,
        allowlist: undefined,
      }),
    ),
    "MISSING_PREVIEW_ALLOWLIST",
    "missing allowlist must refuse in preview",
  );
  assert.equal(
    codeOf(() =>
      assertPreviewDatabaseTarget({
        vercelEnv: "preview",
        databaseUrl: APPROVED_URL,
        allowlist: " , , ",
      }),
    ),
    "MISSING_PREVIEW_ALLOWLIST",
    "empty allowlist must refuse in preview",
  );
  assert.equal(
    codeOf(() => parseDatabaseTarget("not a url", "DATABASE_URL")),
    "MALFORMED_DATABASE_URL",
    "malformed URL must refuse",
  );
  assert.equal(
    codeOf(() => parseDatabaseTarget("mysql://u:p@host/db", "DATABASE_URL")),
    "BAD_DATABASE_SCHEME",
    "non-postgres scheme must refuse",
  );
  pass("preview with missing or malformed configuration is refused");

  // ── 2. Production database target in Preview ───────────────────────────────
  assert.equal(
    codeOf(() =>
      assertPreviewDatabaseTarget({
        vercelEnv: "preview",
        databaseUrl: PRODUCTION_URL,
        allowlist: APPROVED,
      }),
    ),
    "PRODUCTION_DATABASE_TARGET",
    "a managed provider host must be refused in preview",
  );
  assert.equal(
    codeOf(() =>
      assertPreviewDatabaseTarget({
        vercelEnv: "preview",
        databaseUrl: PRODUCTION_URL,
        allowlist: "some-other-host:5432/other",
      }),
    ),
    "PRODUCTION_DATABASE_TARGET",
    "production host refused regardless of an unrelated allowlist",
  );
  pass("a production database target is refused in preview");

  // ── 3. Unknown target in Preview ───────────────────────────────────────────
  assert.equal(
    codeOf(() =>
      assertPreviewDatabaseTarget({
        vercelEnv: "preview",
        databaseUrl: OTHER_URL,
        allowlist: APPROVED,
      }),
    ),
    "UNAPPROVED_PREVIEW_TARGET",
    "an unknown host must be refused in preview",
  );
  assert.equal(
    codeOf(() =>
      assertPreviewDatabaseTarget({
        vercelEnv: "preview",
        databaseUrl:
          "postgresql://u:p@preview-db.internal.example.com:9999/keebforge_preview",
        allowlist: APPROVED,
      }),
    ),
    "UNAPPROVED_PREVIEW_TARGET",
    "a matching host on the wrong port must be refused",
  );
  assert.equal(
    codeOf(() =>
      assertPreviewDatabaseTarget({
        vercelEnv: "preview",
        databaseUrl: APPROVED_URL,
        directUrl: PRODUCTION_URL,
        allowlist: APPROVED,
      }),
    ),
    "PRODUCTION_DATABASE_TARGET",
    "an unapproved DIRECT_URL must be refused even if DATABASE_URL is approved",
  );
  pass("an unknown target is refused in preview");

  // ── 4. Explicitly approved Preview target ──────────────────────────────────
  {
    const decision = assertPreviewDatabaseTarget({
      vercelEnv: "preview",
      databaseUrl: APPROVED_URL,
      allowlist: APPROVED,
    });
    assert.equal(decision.enforced, true, "approved target must be enforced");
    assert.ok(decision.enforced);
    assert.deepEqual(
      decision.database,
      {
        host: "preview-db.internal.example.com",
        port: "5432",
        database: "keebforge_preview",
      },
      "the approved target must be returned sanitized",
    );
  }
  {
    const decision = assertPreviewDatabaseTarget({
      vercelEnv: "preview",
      databaseUrl:
        "postgresql://u:p@PREVIEW-DB.Internal.Example.com:5432/keebforge_preview",
      directUrl:
        "postgresql://u:p@preview-db.internal.example.com:5432/keebforge_preview",
      allowlist: APPROVED,
    });
    assert.equal(decision.enforced, true, "case-insensitive host must match");
  }
  {
    const decision = assertPreviewDatabaseTarget({
      vercelEnv: "preview",
      databaseUrl: "postgresql://u:p@host-only.example.com:6543/anything",
      allowlist: "host-only.example.com",
    });
    assert.equal(decision.enforced, true, "a host-only entry matches any port/db");
  }
  assert.equal(
    targetApproved(
      {
        host: "evil-preview-db.internal.example.com",
        port: "5432",
        database: "keebforge_preview",
      },
      parsePreviewAllowlist(APPROVED),
    ),
    false,
    "a lookalike host must not match the allowlist",
  );
  pass("an explicitly approved preview target is allowed");

  // ── 5. Local development ───────────────────────────────────────────────────
  for (const vercelEnv of [undefined, "", "development"]) {
    assert.deepEqual(
      assertPreviewDatabaseTarget({
        vercelEnv,
        databaseUrl: undefined,
        allowlist: undefined,
      }),
      { enforced: false },
      "local development must not enforce the guard",
    );
  }
  assert.equal(
    resolveOperationsAllowed({ vercelEnv: undefined, optIn: undefined }),
    true,
    "local development permits operations",
  );
  pass("local development is unenforced");

  // ── 6. Production ──────────────────────────────────────────────────────────
  assert.deepEqual(
    assertPreviewDatabaseTarget({
      vercelEnv: "production",
      databaseUrl: undefined,
      allowlist: undefined,
    }),
    { enforced: false },
    "production must not enforce the preview guard",
  );
  assert.equal(
    resolveOperationsAllowed({ vercelEnv: "production", optIn: undefined }),
    true,
    "production permits operations",
  );
  pass("production is unenforced");

  // ── F1: query strings and fragments can override the authority ─────────────
  // A URL whose hostname is explicitly approved must still be refused when it
  // carries a query string. PostgreSQL/Prisma accept parameters such as `host`,
  // `port`, `socket_path` and `database` that redirect the connection, and the
  // host/port check never sees them. This mirrors the migration guard's
  // `UNAPPROVED_URL_PARAMS`.
  for (const bad of [
    "postgresql://u:p@preview-db.internal.example.com:5432/keebforge_preview?host=evil.example.net",
    "postgresql://u:p@preview-db.internal.example.com:5432/keebforge_preview?port=6543",
    "postgresql://u:p@preview-db.internal.example.com:5432/keebforge_preview?socket_path=/tmp/.s.PGSQL.5432",
    "postgresql://u:p@preview-db.internal.example.com:5432/keebforge_preview?database=postgres",
    "postgresql://u:p@preview-db.internal.example.com:5432/keebforge_preview?",
    "postgresql://u:p@preview-db.internal.example.com:5432/keebforge_preview#fragment",
  ]) {
    assert.equal(
      codeOf(() =>
        assertPreviewDatabaseTarget({
          vercelEnv: "preview",
          databaseUrl: bad,
          allowlist: APPROVED,
        }),
      ),
      "UNAPPROVED_URL_PARAMS",
      `a URL carrying a query/fragment must be refused even on an approved host: ${bad}`,
    );
  }
  // Even an allowlist entry is refused a query/fragment, so the approved-target
  // syntax can never itself smuggle one.
  assert.equal(
    codeOf(() => parsePreviewAllowlist("preview-db.internal.example.com?host=x")),
    "BAD_PREVIEW_ALLOWLIST_ENTRY",
    "an allowlist entry with a query string must be refused",
  );
  // The error names parameters but never their values (a value can be a secret).
  {
    let message = "";
    try {
      assertPreviewDatabaseTarget({
        vercelEnv: "preview",
        databaseUrl:
          "postgresql://preview_user:secret@preview-db.internal.example.com:5432/keebforge_preview?host=evil.example.net&password=hunter2",
        allowlist: APPROVED,
      });
      assert.fail("expected the guard to throw");
    } catch (e) {
      assert.ok(e instanceof PreviewGuardError);
      message = e.message;
    }
    assert.ok(
      !message.includes("evil.example.net") && !message.includes("hunter2"),
      "the URL-params error must not echo parameter values",
    );
  }
  // Embedded credentials are tolerated — the connection needs them, and WHATWG
  // parsing fixes the host after the last `@`, so a credential cannot restructure
  // the target. This mirrors the migration guard's metacharacter-password test.
  {
    const decision = assertPreviewDatabaseTarget({
      vercelEnv: "preview",
      databaseUrl:
        "postgresql://preview_user:p%40ss%3Aword%2Fwith%3Fchars@preview-db.internal.example.com:5432/keebforge_preview",
      allowlist: APPROVED,
    });
    assert.ok(decision.enforced);
    assert.deepEqual(
      decision.database,
      {
        host: "preview-db.internal.example.com",
        port: "5432",
        database: "keebforge_preview",
      },
      "credentials must not change the resolved target",
    );
  }
  pass("query strings and fragments are refused; credentials cannot redirect a target");

  // ── F3 / F4: allowlist entries ─────────────────────────────────────────────
  // F4: bracketed IPv6 literals, with and without a port.
  assert.deepEqual(
    parsePreviewAllowlist("[::1]:5432/keebforge_preview"),
    [{ host: "::1", port: "5432", database: "keebforge_preview" }],
    "a bracketed IPv6 entry with port/database must parse",
  );
  assert.deepEqual(
    parsePreviewAllowlist("[2001:DB8::1]"),
    [{ host: "2001:db8::1", port: undefined, database: undefined }],
    "a bracketed IPv6 entry without port must parse and lower-case",
  );
  {
    const decision = assertPreviewDatabaseTarget({
      vercelEnv: "preview",
      databaseUrl: "postgresql://u:p@[::1]:5432/keebforge_preview",
      allowlist: "[::1]:5432/keebforge_preview",
    });
    assert.ok(decision.enforced);
    assert.deepEqual(decision.database, {
      host: "::1",
      port: "5432",
      database: "keebforge_preview",
    });
  }
  // F4: an unbracketed IPv6 literal is ambiguous with `host:port` — refuse it
  // rather than silently split it.
  assert.equal(codeOf(() => parsePreviewAllowlist("::1")), "BAD_PREVIEW_ALLOWLIST_ENTRY");
  assert.equal(
    codeOf(() => parsePreviewAllowlist("2001:db8::1")),
    "BAD_PREVIEW_ALLOWLIST_ENTRY",
  );
  // Ambiguous or malformed entries fail closed.
  for (const bad of [
    ":5432",
    "host:",
    "host:abc",
    "host:0",
    "host:70000",
    "u:p@host",
    "host/db?x=1",
    "host #frag",
    "[::1",
    "[::1]junk",
  ]) {
    assert.equal(
      codeOf(() => parsePreviewAllowlist(bad)),
      "BAD_PREVIEW_ALLOWLIST_ENTRY",
      `a malformed allowlist entry must be refused: ${JSON.stringify(bad)}`,
    );
  }
  // F3: matching granularity is explicit. Host-only matches any port/database;
  // a port/database in the entry pins that component.
  assert.equal(
    targetApproved(
      { host: "h.example.com", port: "1", database: "a" },
      parsePreviewAllowlist("h.example.com"),
    ),
    true,
    "a host-only entry matches any port/database",
  );
  assert.equal(
    targetApproved(
      { host: "h.example.com", port: "1", database: "a" },
      parsePreviewAllowlist("h.example.com:2"),
    ),
    false,
    "a pinned port must not match a different port",
  );
  assert.equal(
    targetApproved(
      { host: "h.example.com", port: "2", database: "a" },
      parsePreviewAllowlist("h.example.com:2"),
    ),
    true,
    "a pinned port matches the same port regardless of database",
  );
  assert.equal(
    targetApproved(
      { host: "h.example.com", port: "2", database: "a" },
      parsePreviewAllowlist("h.example.com:2/b"),
    ),
    false,
    "a pinned database must not match a different database",
  );
  assert.equal(
    targetApproved(
      { host: "h.example.com", port: "2", database: "b" },
      parsePreviewAllowlist("h.example.com:2/B"),
    ),
    true,
    "database matching is case-insensitive",
  );
  pass("allowlist entries parse IPv6 explicitly and fail closed on ambiguity");

  // ── F2: an unrecognised VERCEL_ENV fails closed, exactly like Preview ──────
  assert.equal(
    codeOf(() =>
      assertPreviewDatabaseTarget({
        vercelEnv: "staging",
        databaseUrl: PRODUCTION_URL,
        allowlist: APPROVED,
      }),
    ),
    "PRODUCTION_DATABASE_TARGET",
    "an unknown context must enforce the database guard",
  );
  assert.equal(
    codeOf(() =>
      assertPreviewDatabaseTarget({
        vercelEnv: "staging",
        databaseUrl: APPROVED_URL,
        allowlist: undefined,
      }),
    ),
    "MISSING_PREVIEW_ALLOWLIST",
    "an unknown context with no allowlist must refuse",
  );
  {
    const decision = assertPreviewDatabaseTarget({
      vercelEnv: "staging",
      databaseUrl: APPROVED_URL,
      allowlist: APPROVED,
    });
    assert.equal(
      decision.enforced,
      true,
      "an unknown context with an explicitly approved target is allowed",
    );
  }
  assert.equal(
    resolveOperationsAllowed({ vercelEnv: "staging", optIn: undefined }),
    false,
    "operations must be blocked in an unknown context by default",
  );
  assert.equal(
    resolveOperationsAllowed({ vercelEnv: "staging", optIn: "true" }),
    true,
    "an explicit opt-in unlocks operations in an unknown context",
  );
  pass("an unrecognised VERCEL_ENV fails closed");

  // ── Errors never leak the URL, host or credentials ─────────────────────────
  for (const [label, fn] of [
    [
      "production target",
      () =>
        assertPreviewDatabaseTarget({
          vercelEnv: "preview",
          databaseUrl: PRODUCTION_URL,
          allowlist: APPROVED,
        }),
    ],
    [
      "unknown target",
      () =>
        assertPreviewDatabaseTarget({
          vercelEnv: "preview",
          databaseUrl: OTHER_URL,
          allowlist: APPROVED,
        }),
    ],
    [
      "malformed URL",
      () => parseDatabaseTarget("postgresql://user:sup3rsecret@[bad", "DATABASE_URL"),
    ],
  ] as const) {
    let message = "";
    try {
      fn();
      assert.fail(`expected ${label} to throw`);
    } catch (e) {
      assert.ok(e instanceof PreviewGuardError, `${label} must throw PreviewGuardError`);
      message = e.message;
    }
    assert.ok(!message.includes("sup3rsecret"), `${label}: error must not leak credentials`);
    assert.ok(!message.includes("postgresql://"), `${label}: error must not leak the URL`);
    assert.ok(!message.includes("pooler.supabase.com"), `${label}: error must not leak the host`);
  }
  pass("guard errors never leak the URL, host or credentials");

  // ── Operation guards ───────────────────────────────────────────────────────
  assert.equal(
    resolveOperationsAllowed({ vercelEnv: "preview", optIn: undefined }),
    false,
    "preview operations are blocked by default",
  );
  assert.equal(
    resolveOperationsAllowed({ vercelEnv: "preview", optIn: "false" }),
    false,
    "an explicit false keeps preview operations blocked",
  );
  for (const optIn of ["1", "true", "TRUE", "yes", "on", "enabled"]) {
    assert.equal(
      resolveOperationsAllowed({ vercelEnv: "preview", optIn }),
      true,
      `PREVIEW_DANGEROUS_OPERATIONS_ENABLED=${optIn} must opt in`,
    );
  }
  pass("preview operations are blocked unless explicitly opted in");

  // ── Part B: the server-only wrapper reads the real environment ─────────────
  const mod = Module as unknown as {
    _load: (
      this: unknown,
      request: string,
      parent: { filename?: string } | null,
      main: boolean,
    ) => unknown;
    __pgStubbed?: boolean;
  };
  if (!mod.__pgStubbed) {
    const orig = mod._load;
    mod._load = function (request, parent, main) {
      if (request === "server-only") return {};
      return orig.call(this, request, parent, main);
    };
    mod.__pgStubbed = true;
  }
  const wrapper = await import("@/lib/config/deployment");

  const savedEnv = {
    vercel: process.env.VERCEL_ENV,
    db: process.env.DATABASE_URL,
    direct: process.env.DIRECT_URL,
    allowlist: process.env[PREVIEW_DATABASE_TARGETS_ENV],
    ops: process.env[PREVIEW_OPERATIONS_ENV],
  };
  const withEnv = <T>(
    vars: Record<string, string | undefined>,
    fn: () => T,
  ): T => {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      return fn();
    } finally {
      process.env.VERCEL_ENV = savedEnv.vercel;
      process.env.DATABASE_URL = savedEnv.db;
      process.env.DIRECT_URL = savedEnv.direct;
      if (savedEnv.allowlist === undefined)
        delete process.env[PREVIEW_DATABASE_TARGETS_ENV];
      else process.env[PREVIEW_DATABASE_TARGETS_ENV] = savedEnv.allowlist;
      if (savedEnv.ops === undefined) delete process.env[PREVIEW_OPERATIONS_ENV];
      else process.env[PREVIEW_OPERATIONS_ENV] = savedEnv.ops;
    }
  };

  withEnv(
    {
      VERCEL_ENV: "preview",
      DATABASE_URL: undefined,
      DIRECT_URL: undefined,
      [PREVIEW_DATABASE_TARGETS_ENV]: APPROVED,
      [PREVIEW_OPERATIONS_ENV]: undefined,
    },
    () => {
      assert.equal(wrapper.isPreviewDeployment(), true);
      assert.equal(wrapper.currentDeploymentEnvironment(), "preview");
      assert.equal(
        codeOf(() => wrapper.assertDeploymentDatabaseConfig()),
        "MISSING_DATABASE_URL",
        "wrapper must read DATABASE_URL and refuse when missing in preview",
      );
      assert.equal(
        wrapper.previewOperationsAllowed(),
        false,
        "wrapper must block operations in preview by default",
      );
    },
  );

  withEnv(
    {
      VERCEL_ENV: "preview",
      DATABASE_URL: APPROVED_URL,
      DIRECT_URL: undefined,
      [PREVIEW_DATABASE_TARGETS_ENV]: APPROVED,
    },
    () => {
      assert.equal(wrapper.assertDeploymentDatabaseConfig().enforced, true);
    },
  );

  withEnv(
    {
      VERCEL_ENV: undefined,
      DATABASE_URL: undefined,
      DIRECT_URL: undefined,
      [PREVIEW_DATABASE_TARGETS_ENV]: undefined,
      [PREVIEW_OPERATIONS_ENV]: undefined,
    },
    () => {
      assert.equal(wrapper.isPreviewDeployment(), false);
      assert.deepEqual(wrapper.assertDeploymentDatabaseConfig(), {
        enforced: false,
      });
      assert.equal(wrapper.previewOperationsAllowed(), true);
    },
  );
  pass("the server-only wrapper reads VERCEL_ENV and the allowlist from the environment");

  // ── Part C: Prisma wiring runs the guard before a client exists ────────────
  {
    const prismaSrc = fs.readFileSync(
      path.resolve(import.meta.dirname, "..", "db", "prisma.ts"),
      "utf8",
    );
    const guardAt = prismaSrc.indexOf("assertPreviewDatabaseTargetFromEnv(");
    const clientAt = prismaSrc.indexOf("new PrismaClient(");
    assert.ok(guardAt >= 0, "prisma.ts must call the deployment guard");
    assert.ok(clientAt >= 0, "prisma.ts must construct a PrismaClient");
    assert.ok(
      guardAt < clientAt,
      "the guard must run before a PrismaClient is constructed",
    );

    const deploymentSrc = fs.readFileSync(
      path.resolve(import.meta.dirname, "deployment.ts"),
      "utf8",
    );
    assert.ok(
      deploymentSrc.includes('import "server-only"'),
      "the deployment helper must be server-only",
    );
  }
  pass("prisma.ts enforces the guard before constructing a client");

  // ── Part D: every route and server action is explicitly classified ─────────
  // G1: it must be impossible for a newly added route or server action that can
  // initiate payments or reach a sensitive external service to silently bypass
  // the Preview restrictions. The coverage test discovers every route handler
  // and server action, requires each one to be listed below with a protection
  // category, and checks that the file actually carries that protection.
  //
  // A new unclassified file fails the suite by name, so the fix is a deliberate
  // decision (add the appropriate guard, or classify it "indirect"), never a
  // silent bypass.
  //
  // Categories:
  //   preview  — refuses in Preview via previewOperationsAllowed()
  //   admin    — behind the admin authorization guard
  //   db       — initialises Prisma, so the database guard runs first and fails
  //              closed in Preview
  //   indirect — no payment initiation and no sensitive external service; must
  //              contain none of the sensitive markers
  const INDIRECT = "indirect";
  const ADMIN = "admin";
  const DB = "db";
  const PREVIEW = "preview";

  const INVENTORY: Record<string, string> = {
    "src/app/admin/products/export/route.ts": ADMIN,
    "src/app/api/account/addresses/[id]/default/route.ts": DB,
    "src/app/api/account/addresses/[id]/route.ts": DB,
    "src/app/api/account/addresses/route.ts": DB,
    "src/app/api/account/profile/route.ts": DB,
    "src/app/api/auth/[...all]/route.ts": INDIRECT,
    "src/app/api/auth/check-username/route.ts": DB,
    "src/app/api/auth/me/route.ts": INDIRECT,
    "src/app/api/cart/count/route.ts": DB,
    "src/app/api/cart/route.ts": DB,
    "src/app/api/cart/service/route.ts": DB,
    "src/app/api/coupons/validate/route.ts": INDIRECT,
    "src/app/api/cron/reconcile-paid-notifications/route.ts": PREVIEW,
    "src/app/api/payments/create-order/route.ts": PREVIEW,
    "src/app/api/payments/exchange/route.ts": DB,
    "src/app/api/payments/pay-inline/route.ts": PREVIEW,
    "src/app/api/payments/verify/route.ts": DB,
    "src/app/api/payments/webhook/route.ts": DB,
    "src/app/api/services/create-order/route.ts": PREVIEW,
    "src/app/api/settings/public/route.ts": INDIRECT,
    "src/app/api/shipping/calculate/route.ts": PREVIEW,
    "src/app/api/shipping/service-quote/route.ts": PREVIEW,
    "src/app/api/uploads/route.ts": ADMIN,
    "src/app/reset-password/[token]/route.ts": INDIRECT,
    "src/app/account/settings/actions.ts": DB,
    "src/app/actions/cart.ts": DB,
    "src/app/actions/inquiry.ts": PREVIEW,
    "src/app/actions/repair-request.ts": DB,
    "src/app/actions/review.ts": DB,
    "src/app/actions/track-order.ts": DB,
    "src/app/admin/actions/catalog.ts": ADMIN,
    "src/app/admin/actions/coupons.ts": ADMIN,
    "src/app/admin/actions/mods.ts": ADMIN,
    "src/app/admin/actions/notifications.ts": ADMIN,
    "src/app/admin/actions/orders.ts": ADMIN,
    "src/app/admin/actions/reviews.ts": ADMIN,
    "src/app/admin/actions/settings.ts": ADMIN,
    "src/app/admin/actions/work.ts": ADMIN,
  };

  const CATEGORY_TOKENS: Record<string, string[]> = {
    [PREVIEW]: ["previewOperationsAllowed("],
    [ADMIN]: ["getAdminContext", "requirePermission"],
    [DB]: ["@/lib/db/prisma"],
    [INDIRECT]: [],
  };

  const SENSITIVE_MARKERS: { name: string; re: RegExp }[] = [
    { name: "razorpay", re: /Razorpay|RAZORPAY_/ },
    { name: "resend", re: /Resend|RESEND_/ },
    { name: "delhivery", re: /Delhivery|DELHIVERY_|calculateShipping/ },
    { name: "cloudinary", re: /Cloudinary|CLOUDINARY_|uploadBuffer|deleteImage/ },
  ];

  {
    const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
    const appDir = path.join(repoRoot, "src", "app");
    const isAction = (rel: string) =>
      /\/actions\.ts$/.test(rel) || /\/actions\/[^/]+\.ts$/.test(rel);
    const discovered: string[] = [];
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          walk(full);
        } else if (
          ent.isFile() &&
          ent.name.endsWith(".ts") &&
          !ent.name.endsWith(".test.ts")
        ) {
          const rel = path.relative(repoRoot, full).split(path.sep).join("/");
          if (ent.name === "route.ts" || isAction(rel)) discovered.push(rel);
        }
      }
    };
    walk(appDir);
    discovered.sort();

    const listed = new Set(Object.keys(INVENTORY));
    const found = new Set(discovered);
    const unclassified = discovered.filter((rel) => !listed.has(rel));
    assert.equal(
      unclassified.length,
      0,
      `new route/action file(s) must be classified in the INVENTORY of ` +
        `src/lib/config/preview-guard.test.ts: ${unclassified.join(", ")}`,
    );
    const stale = [...listed].filter((rel) => !found.has(rel)).sort();
    assert.equal(
      stale.length,
      0,
      `INVENTORY lists file(s) that no longer exist: ${stale.join(", ")}`,
    );

    for (const [rel, category] of Object.entries(INVENTORY)) {
      const src = fs.readFileSync(path.join(repoRoot, rel), "utf8");
      if (category === INDIRECT) {
        const hit = SENSITIVE_MARKERS.find((m) => m.re.test(src));
        assert.ok(
          !hit,
          `${rel} is classified "indirect" but uses a sensitive service (${hit?.name})`,
        );
      } else {
        const tokens = CATEGORY_TOKENS[category];
        assert.ok(
          tokens.some((t) => src.includes(t)),
          `${rel} is classified "${category}" but contains none of: ${tokens.join(", ")}`,
        );
      }
    }
  }
  pass("every route and server action is explicitly classified and guarded");

  console.log(`\nPASS all ${n} preview-guard checks`);
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
