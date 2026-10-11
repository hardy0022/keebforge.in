import "server-only";
import {
  planOutboundRecipient,
  type OutboundEnv,
  type OutboundPlan,
} from "@/lib/email/outbound-policy";

/**
 * Server-only entry point for the shared outbound-email recipient policy.
 *
 * All six outbound mail paths import `resolveOutboundRecipient` from here.
 * The `server-only` guard keeps the policy — and the environment values it
 * reads — out of any client bundle; the pure decision logic lives in
 * `@/lib/email/outbound-policy` so it can be unit-tested directly.
 */

export function resolveOutboundRecipient(
  originalTo: string,
  env: OutboundEnv = process.env,
): OutboundPlan {
  return planOutboundRecipient(originalTo, env);
}

/**
 * One sanitized line when a send is intentionally suppressed. The reason is a
 * fixed enum; the override address is never logged.
 */
export function logSuppressedDelivery(reason: string): void {
  console.warn(
    `[email] outbound delivery suppressed (${reason}); nothing was sent`,
  );
}

export { planOutboundRecipient };
export type { OutboundEnv, OutboundPlan, OutboundSkipReason } from "@/lib/email/outbound-policy";
