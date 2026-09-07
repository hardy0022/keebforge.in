/**
 * Delhivery pickup time slots (Asia/Kolkata).
 *
 * The /fm/request/new/ API takes a single `hh:mm:ss` pickup_time, but pickups
 * are scheduled into fixed slots (start–end). A slot stays bookable while
 * `now < slot end` — Delhivery rolls an ended slot to the next day instead of
 * rejecting it. All slot/value logic lives here so the client defaults and the
 * server guard can't drift apart.
 */

export type PickupSlot = { start: string; end: string };

export const DELHIVERY_PICKUP_SLOTS: PickupSlot[] = [
  { start: "14:00:00", end: "18:00:00" },
  { start: "18:00:00", end: "21:00:00" },
];

/** Slot start value a given <option> submits (matches the HH:MM:SS schema). */
export const slotLabel = (s: PickupSlot) =>
  `${s.start} – ${s.end}`;

/** The next slot that is still open: earliest future END (scans 3 days). */
export function nextPickup(nowMs = Date.now()): {
  dateKey: string;
  slotStart: string;
} {
  const day = 86_400_000;
  for (let i = 0; i < 3; i += 1) {
    const t = nowMs + i * day;
    const dateKey = new Date(t).toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    const open = DELHIVERY_PICKUP_SLOTS.find(
      (s) => Date.parse(`${dateKey}T${s.end}+05:30`) > nowMs,
    );
    if (open) return { dateKey, slotStart: open.start };
  }
  return { dateKey: "", slotStart: "" };
}

/** UTC ms instant when a given date+slot closes (for the future-guard). */
export function pickupSlotEndsAt(dateKey: string, slotStart: string): number {
  const s = DELHIVERY_PICKUP_SLOTS.find((x) => x.start === slotStart);
  return Date.parse(`${dateKey}T${s?.end ?? slotStart}+05:30`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`[pickup-slots] ${msg}`);
  };
  // 19:30 IST — 18:00–21:00 still open today.
  assert(
    nextPickup(new Date("2026-09-07T14:00:00Z").getTime()).slotStart ===
      "18:00:00",
    "open late-evening slot at 19:30 IST",
  );
  // 02:40 IST next day — nothing left today, pick tomorrow 14:00.
  assert(
    nextPickup(new Date("2026-09-07T21:10:00Z").getTime()).dateKey ===
      "2026-09-08",
    "rolls to next earliest day",
  );
  assert(
    nextPickup(new Date("2026-09-07T21:10:00Z").getTime()).slotStart ===
      "14:00:00",
    "next day earliest slot",
  );
  // Guard instant: 18:00–21:00 on 2026-09-07 closes at 15:30 UTC.
  assert(
    pickupSlotEndsAt("2026-09-07", "18:00:00") ===
      new Date("2026-09-07T15:30:00Z").getTime(),
    "slot end UTC instant",
  );
  console.log("[pickup-slots] OK");
}