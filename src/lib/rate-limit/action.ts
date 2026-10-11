import { headers } from "next/headers";
import { checkRateLimit, clientIp } from "@/lib/payments/rate-limit";

/**
 * Rate-limiting for server actions, which have no Request to read IPv4 from
 * — `next/headers` carries the incoming headers. Returns the standard
 * user-facing rejection that an action turns into its state's `error`.
 */
export const RATE_LIMIT_ACTION_MESSAGE =
  "Too many requests. Please wait a moment before trying again.";

export async function actionRateLimited(
  scope: string,
  opts: { limit: number; windowMs: number },
  keySeed?: string,
): Promise<boolean> {
  const h = await headers();
  const key = keySeed
    ? `${scope}:${keySeed}`
    : `${scope}:ip:${clientIp({ headers: h })}`;
  const decision = checkRateLimit(key, opts);
  return !decision.allowed;
}