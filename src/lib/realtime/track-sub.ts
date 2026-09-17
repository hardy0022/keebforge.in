"use client";

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let realtimeClient: ReturnType<typeof createClient> | null = null;

function client() {
  if (!realtimeClient) {
    realtimeClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return realtimeClient;
}

export type TrackSubscription = { unsubscribe: () => void };

/**
 * Subscribes to broadcast "tracking-changed" events for one order number.
 * An event for any other order is ignored. Returns null (no-op) when Realtime
 * is not configured — the page then works exactly as before.
 */
export function subscribeTrackingChanged(
  orderNumber: string,
  onChanged: () => void,
): TrackSubscription | null {
  if (!SUPABASE_URL || !ANON_KEY) return null;
  const channel = client().channel(`tracking:${orderNumber}`, {
    config: { broadcast: { self: false, ack: false } },
  });
  channel
    .on("broadcast", { event: "tracking-changed" }, (message) => {
      if (message.payload?.orderNumber === orderNumber) onChanged();
    })
    .subscribe();
  return {
    unsubscribe() {
      void client().removeChannel(channel);
    },
  };
}