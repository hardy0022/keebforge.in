import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CRON_SECRET_ENV,
  RECONCILE_LIMIT_ENV,
  RECONCILE_SINCE_ENV,
  authorizeCronRequest,
  parseReconcileCutoff,
  resolveReconcileLimit,
  runScheduledReconcile,
  SCHEDULED_RECONCILE_HARD_MAX,
  type ScheduledReconcileDeps,
} from "@/lib/notifications/reconcile-cron";
import {
  queueMissingPaidConfirmations,
  type ReconcileCandidate,
  type ReconciliationDeps,
} from "@/lib/notifications/paid-confirmation";

/**
 * Scheduled reconciliation (Part A).
 *
 * Pins the security and bounding guarantees of the cron path:
 *  1. Authorization fails closed and compares in constant time.
 *  2. A missing/malformed cutoff refuses the run before any scan or queue.
 *  3. The per-run cap is hard-coded; an env override can only lower it.
 *  4. Only fully paid, sendable orders on/after the cutoff are queued, exactly
 *     once, and the path has no way to send an email.
 */

let n = 0;
const pass = (msg: string) => {
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${msg}`);
};

const REPO = path.resolve(import.meta.dirname, "..", "..", "..");
const ROUTE = path.join(
  REPO,
  "src/app/api/cron/reconcile-paid-notifications/route.ts",
);

type Row = ReconcileCandidate & { createdAt: Date };

function row(
  id: string,
  type: string,
  customerEmail: string,
  createdAt: Date,
  paymentStatus = "PAID",
): Row {
  return {
    id,
    orderNumber: `KF-${id}`,
    type,
    paymentStatus,
    customerEmail,
    createdAt,
  };
}

/**
 * In-memory stand-in for the bounded, eligible-only "missing" query plus the
 * create-only queue. `send` is a spy that must never be invoked.
 */
function makeDeps(rows: Row[]) {
  const queued = new Set<string>();
  const queueCalls: string[] = [];
  let sendCalls = 0;
  const deps: ReconciliationDeps & { send: () => Promise<never> } = {
    listMissing: async ({ since, eligibleOnly, limit }) =>
      rows
        .filter((r) => r.paymentStatus === "PAID")
        .filter((r) => (since ? r.createdAt.getTime() >= since.getTime() : true))
        .filter((r) => !queued.has(r.id))
        .filter((r) =>
          eligibleOnly
            ? (r.type === "PRODUCT" || r.type === "SERVICE") && r.customerEmail !== ""
            : true,
        )
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, limit)
        .map(({ id, orderNumber, type, paymentStatus, customerEmail }) => ({
          id,
          orderNumber,
          type,
          paymentStatus,
          customerEmail,
        })),
    queue: async (id) => {
      queueCalls.push(id);
      if (queued.has(id)) return "exists";
      queued.add(id);
      return "created";
    },
    send: async () => {
      sendCalls += 1;
      throw new Error("the scheduled path must never send");
    },
  };
  return { deps, queued, queueCalls, sendCalls: () => sendCalls };
}

void (async () => {
  const cutoff = new Date("2026-10-01T00:00:00Z");

  // ── Authorization ──────────────────────────────────────────────────────────

  {
    assert.equal(authorizeCronRequest(null, undefined), "missing-config");
    assert.equal(authorizeCronRequest("Bearer anything", ""), "missing-config");
    assert.equal(authorizeCronRequest(null, "secret"), "denied");
    assert.equal(
      authorizeCronRequest("Bearer 123456", "secret"),
      "denied",
      "equal-length wrong secret is denied",
    );
    assert.equal(
      authorizeCronRequest("Bearer short", "a-much-longer-secret"),
      "denied",
      "length mismatch is denied without comparing",
    );
    assert.equal(
      authorizeCronRequest("bearer secret", "secret"),
      "denied",
      "scheme is case-sensitive",
    );
    assert.equal(authorizeCronRequest("Bearer secret", "secret"), "ok");
    pass("cron authorization fails closed and denies any mismatch");
  }

  // ── Cutoff validation ──────────────────────────────────────────────────────

  {
    for (const bad of [undefined, null, "", "   ", "not-a-date", "0", "2026-10-10"]) {
      assert.equal(parseReconcileCutoff(bad), null, `reject ${JSON.stringify(bad)}`);
    }
    assert.equal(parseReconcileCutoff("2026-13-45T99:99:99Z"), null);
    const exact = parseReconcileCutoff("2026-10-10T00:00:00Z");
    assert.ok(exact instanceof Date);
    assert.equal(exact.toISOString(), "2026-10-10T00:00:00.000Z");
    const offset = parseReconcileCutoff(" 2026-10-10T12:34:56.789+05:30 ");
    assert.ok(offset instanceof Date);
    assert.equal(offset.toISOString(), "2026-10-10T07:04:56.789Z");
    pass("cutoff must be a real ISO instant; date-only and junk are refused");
  }

  // ── Per-run cap resolution ─────────────────────────────────────────────────

  {
    assert.equal(SCHEDULED_RECONCILE_HARD_MAX, 100);
    for (const missing of [undefined, null, "", "abc", "0", "-5"]) {
      assert.equal(resolveReconcileLimit(missing), 100, `default for ${missing}`);
    }
    assert.equal(resolveReconcileLimit("5"), 5);
    assert.equal(resolveReconcileLimit("50"), 50);
    assert.equal(resolveReconcileLimit("100"), 100);
    assert.equal(resolveReconcileLimit("101"), 100, "clamped down to the hard max");
    assert.equal(resolveReconcileLimit("100000"), 100);
    assert.equal(resolveReconcileLimit("100.9"), 100);
    pass("an env limit can only lower the hard-coded 100 cap");
  }

  // ── Eligibility, cutoff and idempotency ────────────────────────────────────

  {
    const rows = [
      row("before", "PRODUCT", "a@b.c", new Date("2026-09-30T23:59:59Z")),
      row("o1", "PRODUCT", "a@b.c", new Date("2026-10-01T00:00:00Z")),
      row("o2", "SERVICE", "c@d.e", new Date("2026-10-02T00:00:00Z")),
      row("repair", "REPAIR", "x@y.z", new Date("2026-10-03T00:00:00Z")),
      row("noemail", "PRODUCT", "", new Date("2026-10-04T00:00:00Z")),
      row("unpaid", "PRODUCT", "u@v.w", new Date("2026-10-05T00:00:00Z"), "PENDING"),
    ];
    const { deps, queued, sendCalls } = makeDeps(rows);

    const first = await queueMissingPaidConfirmations(deps, { since: cutoff });
    assert.equal(first.queued, 2, "only eligible, in-window orders queue");
    assert.deepEqual([...queued].sort(), ["o1", "o2"]);
    assert.equal(sendCalls(), 0, "queuing must never send");

    const second = await queueMissingPaidConfirmations(deps, { since: cutoff });
    assert.equal(second.queued, 0, "a second run is a no-op");
    assert.equal(second.scanned, 0, "nothing eligible remains missing");
    assert.equal(sendCalls(), 0);
    pass("queues only paid+sendable+in-window orders, exactly once");
  }

  // ── The pure sendability gate is the authority ─────────────────────────────

  {
    const queued: string[] = [];
    const deps: ReconciliationDeps = {
      listMissing: async () => [
        row("repair", "REPAIR", "x@y.z", cutoff),
        row("noemail", "PRODUCT", "", cutoff),
        row("unpaid", "PRODUCT", "u@v.w", cutoff, "PENDING"),
        row("ok", "PRODUCT", "a@b.c", cutoff),
      ],
      queue: async (id) => {
        queued.push(id);
        return "created";
      },
    };
    const report = await queueMissingPaidConfirmations(deps, { since: cutoff });
    assert.equal(report.queued, 1);
    assert.deepEqual(queued, ["ok"]);
    assert.equal(report.skipped, 3, "ineligible candidates are counted, not queued");
    pass("the shared sendability gate blocks ineligible rows even if listed");
  }

  // ── Upper-bound enforcement ────────────────────────────────────────────────

  {
    const many = Array.from({ length: 250 }, (_, i) =>
      row(`o${i}`, "PRODUCT", "a@b.c", new Date("2026-10-05T00:00:00Z")),
    );
    const { deps, sendCalls } = makeDeps(many);
    const report = await queueMissingPaidConfirmations(deps, {
      since: cutoff,
      max: 1000,
      batchSize: 40,
    });
    assert.equal(report.queued, 100, "never queues more than the hard max");
    assert.equal(report.capped, true, "a full run is reported as capped");
    assert.ok(report.batches >= 3, "work is read in bounded batches");
    assert.equal(sendCalls(), 0);

    const small = makeDeps(many);
    const limited = await queueMissingPaidConfirmations(small.deps, {
      since: cutoff,
      max: 7,
      batchSize: 100,
    });
    assert.equal(limited.queued, 7, "a lower env cap is honoured");
    assert.equal(limited.capped, true);
    pass("queued records never exceed the resolved per-run cap");
  }

  // ── `capped` means work remains, not merely that the cap was touched ────────

  {
    // A backlog that ends exactly at the cap is fully drained: the bounded probe
    // finds nothing left, so the run must NOT claim more work remains.
    const exact = Array.from({ length: 100 }, (_, i) =>
      row(`o${i}`, "PRODUCT", "a@b.c", new Date("2026-10-05T00:00:00Z")),
    );
    const { deps } = makeDeps(exact);
    const report = await queueMissingPaidConfirmations(deps, {
      since: cutoff,
      max: 100,
      batchSize: 40,
    });
    assert.equal(report.queued, 100);
    assert.equal(report.capped, false, "an exactly-drained backlog is not capped");

    // One more eligible row than the cap: the probe must see it and report capped.
    const over = Array.from({ length: 101 }, (_, i) =>
      row(`o${i}`, "PRODUCT", "a@b.c", new Date("2026-10-05T00:00:00Z")),
    );
    const overDeps = makeDeps(over);
    const capped = await queueMissingPaidConfirmations(overDeps.deps, {
      since: cutoff,
      max: 100,
      batchSize: 40,
    });
    assert.equal(capped.queued, 100);
    assert.equal(capped.capped, true, "a remaining eligible row reports capped");
    pass("capped is true only when eligible work remains after the cap");
  }

  // ── Empty set ──────────────────────────────────────────────────────────────

  {
    const { deps } = makeDeps([]);
    const report = await queueMissingPaidConfirmations(deps, { since: cutoff });
    assert.deepEqual(report, {
      queued: 0,
      scanned: 0,
      skipped: 0,
      batches: 1,
      capped: false,
    });
    pass("an empty backlog scans once and queues nothing");
  }

  // ── The GET handler itself: auth, cutoff, config and no-send ───────────────

  {
    const okReport = { queued: 2, scanned: 2, skipped: 0, batches: 1, capped: false };
    const makeHandlerDeps = (
      env: Record<string, string | undefined>,
      queueMissing: ScheduledReconcileDeps["queueMissing"] = async () => okReport,
    ) => {
      const logs: string[] = [];
      const errors: string[] = [];
      const calls: Array<{ since: Date; max: number }> = [];
      const deps: ScheduledReconcileDeps = {
        env,
        queueMissing: async (input) => {
          calls.push(input);
          return queueMissing(input);
        },
        log: (m) => logs.push(m),
        error: (m) => errors.push(m),
      };
      return { deps, logs, errors, calls };
    };

    const secret = "cron-secret-value";
    const since = "2026-10-01T00:00:00Z";

    // A missing secret is a configuration failure: 500, before any scan.
    {
      const { deps, calls, logs, errors } = makeHandlerDeps({});
      const out = await runScheduledReconcile("Bearer whatever", deps);
      assert.equal(out.status, 500);
      assert.deepEqual(out.body, { error: "Reconciliation is not configured." });
      assert.deepEqual(calls, [], "no queue when the secret is unset");
      assert.equal(logs.length, 0);
      assert.equal(errors.length, 1);
      assert.ok(!errors.join(" ").includes("whatever"), "must not log the header");
      pass("handler refuses with 500 before scanning when the secret is unset");
    }

    // A missing or wrong bearer token is 401, before any scan.
    for (const header of [null, "", "Bearer wrong", "Bearer short", `bearer ${secret}`]) {
      const { deps, calls, errors } = makeHandlerDeps({
        [CRON_SECRET_ENV]: secret,
        [RECONCILE_SINCE_ENV]: since,
      });
      const out = await runScheduledReconcile(header, deps);
      assert.equal(out.status, 401, `401 for ${JSON.stringify(header)}`);
      assert.deepEqual(out.body, { error: "Unauthorized." });
      assert.deepEqual(calls, [], "an unauthorized call never queues");
      assert.ok(!errors.join(" ").includes(secret), "must not log the secret");
    }
    pass("handler rejects a missing or wrong bearer token with 401 and no queue");

    // A missing/malformed cutoff is 500 even with a valid secret, before any scan.
    for (const bad of [undefined, "", "   ", "not-a-date", "2026-10-10"]) {
      const { deps, calls } = makeHandlerDeps({
        [CRON_SECRET_ENV]: secret,
        [RECONCILE_SINCE_ENV]: bad,
      });
      const out = await runScheduledReconcile(`Bearer ${secret}`, deps);
      assert.equal(out.status, 500, `500 for cutoff ${JSON.stringify(bad)}`);
      assert.deepEqual(out.body, { error: "Reconciliation cutoff is not configured." });
      assert.deepEqual(calls, [], "no queue without a valid cutoff");
    }
    pass("handler refuses with 500 before scanning when the cutoff is unusable");

    // Valid authorization and cutoff: queue exactly once, bounded, return the report.
    {
      const { deps, calls, logs, errors } = makeHandlerDeps({
        [CRON_SECRET_ENV]: secret,
        [RECONCILE_SINCE_ENV]: since,
        [RECONCILE_LIMIT_ENV]: "7",
      });
      const out = await runScheduledReconcile(`Bearer ${secret}`, deps);
      assert.equal(out.status, 200);
      assert.deepEqual(out.body, okReport);
      assert.equal(calls.length, 1, "the queue runs exactly once");
      assert.equal(calls[0]!.max, 7, "the resolved per-run cap is passed through");
      assert.equal(calls[0]!.since.toISOString(), "2026-10-01T00:00:00.000Z");
      assert.equal(logs.length, 1);
      assert.equal(errors.length, 0);
      assert.ok(!logs.join(" ").includes(secret), "the success log never carries the secret");
      pass("handler queues once with the resolved cap and returns the report");
    }

    // A failing queue becomes a safe 500 that leaks nothing.
    {
      const { deps, errors } = makeHandlerDeps(
        { [CRON_SECRET_ENV]: secret, [RECONCILE_SINCE_ENV]: since },
        async () => {
          throw new Error(`db failed near ${secret}`);
        },
      );
      const out = await runScheduledReconcile(`Bearer ${secret}`, deps);
      assert.equal(out.status, 500);
      assert.deepEqual(out.body, { error: "Reconciliation failed." });
      assert.ok(!errors.join(" ").includes(secret), "a queue failure must not log the secret");
      pass("handler maps a queue failure to a safe 500");
    }

    // Auth is decided before the cutoff is ever read.
    {
      const { deps, calls } = makeHandlerDeps({ [RECONCILE_SINCE_ENV]: "junk" });
      const out = await runScheduledReconcile(null, deps);
      assert.equal(out.status, 500);
      assert.deepEqual(out.body, { error: "Reconciliation is not configured." });
      assert.deepEqual(calls, [], "config failure never reaches the queue");
      pass("auth is decided before the cutoff is ever read");
    }
  }

  // ── Route wiring and the no-send guarantee (source pins) ───────────────────

  {
    assert.ok(fs.existsSync(ROUTE), "the cron route must exist");
    const route = fs.readFileSync(ROUTE, "utf8");
    for (const needle of [
      "runScheduledReconcile",
      "queueMissingPaidConfirmationsDb",
      'export const dynamic = "force-dynamic"',
      'request.headers.get("authorization")',
    ]) {
      assert.ok(route.includes(needle), `route must include ${needle}`);
    }
    assert.ok(
      !route.includes("notifyPaidOrder"),
      "the cron must never reference the send path",
    );
    assert.ok(
      !route.includes("resend.emails.send"),
      "the cron must never call Resend",
    );
    pass("the cron route delegates to the pure handler and only queues");
  }

  {
    const pure = fs.readFileSync(
      path.join(REPO, "src/lib/notifications/reconcile-cron.ts"),
      "utf8",
    );
    for (const needle of [
      "timingSafeEqual",
      "runScheduledReconcile",
      "authorizeCronRequest",
      "parseReconcileCutoff",
      "CRON_SECRET",
      "PAID_NOTIFICATION_RECONCILE_SINCE",
      "status: 500",
      "status: 401",
    ]) {
      assert.ok(pure.includes(needle), `pure cron module must include ${needle}`);
    }
    assert.ok(
      !pure.includes("send-paid-confirmation") && !pure.includes("notifyPaidOrder"),
      "the pure cron helpers have no send dependency",
    );

    const adapter = fs.readFileSync(
      path.join(REPO, "src/lib/notifications/send-paid-confirmation.ts"),
      "utf8",
    );
    const start = adapter.indexOf(
      "export async function queueMissingPaidConfirmationsDb",
    );
    assert.ok(start >= 0, "the scheduled adapter must exist");
    const body = adapter.slice(start);
    assert.ok(
      body.includes("queueMissingPaidConfirmations(reconciliationDeps"),
      "the adapter delegates to the bounded pure function",
    );
    assert.ok(
      !body.includes("notifyPaidOrder") && !body.includes("deps.send"),
      "the scheduled adapter cannot reach a sender",
    );
    pass("the scheduled path structurally cannot send an email");
  }

  {
    const vercel = JSON.parse(
      fs.readFileSync(path.join(REPO, "vercel.json"), "utf8"),
    ) as { crons?: Array<{ path: string; schedule: string }> };
    assert.ok(Array.isArray(vercel.crons), "vercel.json must declare crons");
    const cron = vercel.crons.find(
      (c) => c.path === "/api/cron/reconcile-paid-notifications",
    );
    assert.ok(cron, "the reconciliation cron must be registered");
    assert.equal(cron.schedule, "0 3 * * *", "it runs once per day at 03:00 UTC");
    pass("vercel.json schedules the cron once per day (Hobby-compatible)");
  }

  console.log(`\nAll ${n} scheduled-reconciliation checks passed.`);
})();
