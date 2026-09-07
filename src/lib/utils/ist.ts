/**
 * Business-day & display helpers pinned to Asia/Kolkata (IST, UTC+05:30).
 *
 * Convention:
 *  - Database timestamps stay UTC (Prisma DateTime).
 *  - Business-day grouping / boundaries are computed in IST.
 *  - Admin-facing dates are formatted in IST, regardless of server/browser TZ.
 *
 * IST has a fixed +05:30 offset (no DST), so we can express day boundaries
 * directly with the standard ISO `+05:30` offset rather than scattered math.
 */

export const BUSINESS_TZ = "Asia/Kolkata";
const OFFSET = "+05:30";

/** ISO calendar day (YYYY-MM-DD) of `d` in IST. */
export function istDayKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: BUSINESS_TZ });
}

/** UTC instant for 00:00:00 IST on the given IST calendar day (YYYY-MM-DD). */
export function istDayStart(key: string): Date {
  return new Date(`${key}T00:00:00${OFFSET}`);
}

/** UTC instant for 23:59:59.999 IST on the given IST calendar day (YYYY-MM-DD). */
export function istDayEnd(key: string): Date {
  return new Date(`${key}T23:59:59.999${OFFSET}`);
}

/** UTC instant for the start of the current IST calendar day. */
export function startOfTodayIST(): Date {
  return istDayStart(istDayKey(new Date()));
}

/** UTC instant for the end of the current IST calendar day. */
export function endOfTodayIST(): Date {
  return istDayEnd(istDayKey(new Date()));
}

/** UTC instant for the start of the IST day `offsetDays` before today. */
export function daysAgoISTDayStart(offsetDays: number): Date {
  const base = new Date();
  const todayKey = istDayKey(base);
  const d = new Date(`${todayKey}T00:00:00${OFFSET}`);
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return istDayStart(d.toISOString().slice(0, 10));
}

/** Format a UTC Date for display as IST (throws nothing; returns "" for null). */
export function fmtIST(
  d: Date | null | undefined,
  opts: Intl.DateTimeFormatOptions,
): string {
  if (!d) return "";
  return d.toLocaleString("en-IN", { timeZone: BUSINESS_TZ, ...opts });
}

/** Parse a `YYYY-MM-DD` date input (from <input type="date">) as IST day start. */
export function parseISTDateKeyStart(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const d = istDayStart(key);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse a `YYYY-MM-DD` date input as IST day end (''T23:59:59.999''). */
export function parseISTDateKeyEnd(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const d = istDayEnd(key);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Self-check for the IST day-boundary logic. Run: tsx src/lib/utils/ist.ts
 * Fails on assertion if a business-day boundary is misclassified.
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`[ist] ${msg}`);
  };
  assert(
    istDayKey(new Date("2026-09-01T07:12:00Z")) === "2026-09-01",
    "1 Sep 12:42 IST must bucket to 2026-09-01",
  );
  assert(
    istDayKey(new Date("2026-08-31T18:25:00Z")) === "2026-08-31",
    "31 Aug 11:55 PM IST must bucket to 2026-08-31",
  );
  assert(
    istDayKey(new Date("2026-08-31T18:35:00Z")) === "2026-09-01",
    "1 Sep 12:05 AM IST must bucket to 2026-09-01",
  );
  assert(
    istDayStart("2026-09-01").toISOString() === "2026-08-31T18:30:00.000Z",
    "01 Sep IST day start UTC instant",
  );
  assert(
    istDayEnd("2026-09-01").toISOString() === "2026-09-01T18:29:59.999Z",
    "01 Sep IST day end UTC instant",
  );
  assert(
    parseISTDateKeyStart("2026-09-01")!.getUTCHours() === 18,
    "startsAt parsed to IST day start",
  );
  assert(
    parseISTDateKeyEnd("2026-09-01")!.toISOString() ===
      "2026-09-01T18:29:59.999Z",
    "expiresAt parsed to IST day end",
  );
  console.log("[ist] boundary self-check OK");
}
