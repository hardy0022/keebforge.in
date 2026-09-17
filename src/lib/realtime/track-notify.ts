import "server-only";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

let serverClient: ReturnType<typeof createClient> | null = null;

function realtimeClient() {
  if (!serverClient) {
    serverClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return serverClient;
}

/**
 * Best-effort "tracking changed" broadcast. Sends ONLY the public order number
 * on the order-scoped channel `tracking:<orderNumber>` (websocket, or the REST
 * broadcast fallback when the socket isn't up). Never throws — Realtime is a
 * UX enhancement, never part of transactional correctness. Missing config /
 * network / authz failure → logged no-op.
 */
export async function emitTrackingChanged(orderNumber: string): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !orderNumber) return;
  try {
    const sent = await realtimeClient()
      .channel(`tracking:${orderNumber}`)
      .send({
        type: "broadcast",
        event: "tracking-changed",
        payload: { orderNumber },
      });
    if (sent !== "ok") {
      console.warn(
        `[realtime] broadcast failed (${sent}) for tracking:${orderNumber}`,
      );
    }
  } catch (err) {
    console.warn("[realtime] broadcast error:", err);
  }
}