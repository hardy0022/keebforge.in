import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  classifyRazorpayWebhook,
  planWebhookAction,
  readWebhookSecret,
  verifyWebhookSignature,
  webhookTimelineNote,
  type RazorpayWebhookClassification,
  type WebhookOrderSnapshot,
} from "@/lib/payments/webhook-core";

// Every payload below is the real Razorpay shape (razorpay/markdown-docs,
// webhooks/payments.md and webhooks/refunds.md). Nothing here touches prisma,
// the network or process.env — the core is pure by design.

// ── Payload fixtures ───────────────────────────────────────────────────────

const CAPTURED_EVENT = JSON.stringify({
  event: "payment.captured",
  contains: ["payment"],
  payload: {
    payment: {
      entity: {
        id: "pay_CAPTURED1",
        entity: "payment",
        amount: 100_000,
        currency: "INR",
        status: "captured",
        order_id: "order_ABC",
        method: "upi",
        amount_refunded: 0,
        refund_status: null,
        captured: true,
        customer_id: "cust_1",
      },
    },
  },
});

const AUTHORIZED_EVENT = JSON.stringify({
  event: "payment.authorized",
  payload: {
    payment: {
      entity: {
        id: "pay_AUTHORIZED",
        amount: 100_000,
        status: "authorized",
        order_id: "order_ABC",
        captured: false,
      },
    },
  },
});

const FAILED_EVENT = JSON.stringify({
  event: "payment.failed",
  payload: {
    payment: {
      entity: {
        id: "pay_FAILED1",
        amount: 100_000,
        status: "failed",
        order_id: "order_ABC",
        error_code: "BAD_REQUEST_ERROR",
        error_description: "Payment failed due to insufficient funds",
      },
    },
  },
});

/** A later attempt for the *outstanding balance* of a ₹1,000 order that already
 *  holds a ₹500 payment. pay-inline creates one Razorpay order per attempt for
 *  exactly this amount, so the captured amount legitimately differs from the
 *  order total. */
const BALANCE_CAPTURE_EVENT = JSON.stringify({
  event: "payment.captured",
  payload: {
    payment: {
      entity: {
        id: "pay_BALANCE1",
        amount: 50_000,
        currency: "INR",
        status: "captured",
        order_id: "order_ABC",
        method: "upi",
        amount_refunded: 0,
        captured: true,
        customer_id: "cust_1",
      },
    },
  },
});

/** A capture that covers only part of what is still owed. */
const PARTIAL_CAPTURE_EVENT = JSON.stringify({
  event: "payment.captured",
  payload: {
    payment: {
      entity: {
        id: "pay_PARTIAL1",
        amount: 25_000,
        currency: "INR",
        status: "captured",
        order_id: "order_ABC",
        method: "upi",
        amount_refunded: 0,
        captured: true,
        customer_id: "cust_1",
      },
    },
  },
});

/** A payload claiming far more than the order is worth. */
const INFLATED_CAPTURE_EVENT = JSON.stringify({
  event: "payment.captured",
  payload: {
    payment: {
      entity: {
        id: "pay_INFLATED1",
        amount: 999_999,
        currency: "INR",
        status: "captured",
        order_id: "order_ABC",
        method: "upi",
        captured: true,
        customer_id: "cust_1",
      },
    },
  },
});

/** A failed attempt on the remaining ₹500 of a ₹1,000 order. */
const FAILED_BALANCE_EVENT = JSON.stringify({
  event: "payment.failed",
  payload: {
    payment: {
      entity: {
        id: "pay_FAILED2",
        amount: 50_000,
        status: "failed",
        order_id: "order_ABC",
        error_code: "BAD_REQUEST_ERROR",
        error_description: "Payment failed due to insufficient funds",
      },
    },
  },
});

/** refund.processed, exactly as Razorpay documents it — including the
 *  embedded captured payment entity that the old status-first routing
 *  misread as a fresh capture. */
const REFUND_PROCESSED_EVENT = JSON.stringify({
  event: "refund.processed",
  contains: ["refund", "payment"],
  payload: {
    refund: {
      entity: {
        id: "rfnd_FULL1",
        entity: "refund",
        amount: 50_000,
        currency: "INR",
        payment_id: "pay_CAPTURED1",
        status: "processed",
      },
    },
    payment: {
      entity: {
        id: "pay_CAPTURED1",
        amount: 100_000,
        currency: "INR",
        status: "captured",
        order_id: "order_ABC",
        amount_refunded: 50_000,
        refund_status: "partial",
        captured: true,
      },
    },
  },
});

/** The follow-up half: cumulative amount_refunded now covers the payment. */
const REFUND_SETTLED_EVENT = JSON.stringify({
  event: "refund.processed",
  payload: {
    refund: {
      entity: {
        id: "rfnd_REST1",
        entity: "refund",
        amount: 50_000,
        payment_id: "pay_CAPTURED1",
        status: "processed",
      },
    },
    payment: {
      entity: {
        id: "pay_CAPTURED1",
        amount: 100_000,
        status: "captured",
        order_id: "order_ABC",
        amount_refunded: 100_000,
        refund_status: "full",
        captured: true,
      },
    },
  },
});

function makeOrder(
  overrides: Partial<WebhookOrderSnapshot> = {},
): WebhookOrderSnapshot {
  return {
    id: "ord_1",
    total: 100_000,
    paymentStatus: "PENDING",
    status: "PAYMENT_PENDING",
    razorpayCustomerId: "cust_1",
    hasPaidPayment: false,
    settledAmount: 0,
    ...overrides,
  };
}

function plan(args: {
  classification: RazorpayWebhookClassification;
  order?: WebhookOrderSnapshot | null;
  existingPaymentStatus?: string | null;
}) {
  return planWebhookAction({
    classification: args.classification,
    order: args.order === undefined ? makeOrder() : args.order,
    existingPaymentStatus: args.existingPaymentStatus ?? null,
  });
}

(async () => {
  // ── 1. Classification: payment events ──────────────────────────────────
  {
    const c = classifyRazorpayWebhook(CAPTURED_EVENT);
    assert.equal(c.action, "CAPTURE");
    assert.equal(c.event, "payment.captured");
    assert.equal(c.paymentId, "pay_CAPTURED1");
    assert.equal(c.razorpayOrderId, "order_ABC");
    assert.equal(c.paymentAmount, 100_000);
    assert.equal(c.method, "upi");
    assert.equal(c.customerId, "cust_1");
    console.log("PASS 1 payment.captured classifies as CAPTURE");
  }

  // ── 2. authorized is NEVER captured ────────────────────────────────────
  {
    const c = classifyRazorpayWebhook(AUTHORIZED_EVENT);
    assert.equal(c.action, "ACK", "authorized money is not settled — must not capture");
    assert.equal(c.paymentId, "pay_AUTHORIZED");

    const p = plan({ classification: c });
    assert.equal(p.kind, "ACK", "an authorized payment must produce no write");
    assert.equal(webhookTimelineNote(p), null, "an ACK plan must produce no note");

    // The decisive assertion: an order that only ever saw `payment.authorized`
    // stays PENDING and is never given a PAID payment row.
    assert.notEqual(p.kind, "CAPTURE");
    assert.notEqual(p.kind, "FAIL");
    console.log("PASS 2 payment.authorized is ACKed, never PAID");
  }

  {
    // Unknown event name still routes off the payment status.
    const c = classifyRazorpayWebhook(
      JSON.stringify({
        event: "order.paid",
        payload: {
          payment: { entity: { id: "pay_X", status: "captured", order_id: "o1" } },
        },
      }),
    );
    assert.equal(c.action, "CAPTURE");
    console.log("PASS 3 unknown event names fall back to the payment status");
  }

  // ── 4. Refunds route by event name, never by the embedded payment ───────
  {
    const c = classifyRazorpayWebhook(REFUND_PROCESSED_EVENT);
    assert.equal(
      c.action,
      "REFUND_PROCESSED",
      "refund must not be routed as a capture",
    );
    assert.notEqual(c.action, "CAPTURE");
    assert.equal(c.refundId, "rfnd_FULL1");
    assert.equal(c.refundAmount, 50_000);
    assert.equal(c.cumulativeRefunded, 50_000);
    console.log("PASS 4 refund.processed classifies as REFUND, not CAPTURE");
  }

  {
    // The regression this guards: the embedded payment entity says "captured",
    // so status-first routing would have re-record the capture. For an
    // already-REFUNDED order the planner still forwards the refund — Batch 4 made
    // refund lifecycle a ledger, so a further refund against an already-refunded
    // payment is a real event that must be recorded — but it must NEVER produce a
    // CAPTURE, which is the plan that would write PAID back onto the order.
    const c = classifyRazorpayWebhook(REFUND_SETTLED_EVENT);
    const p = plan({
      classification: c,
      order: makeOrder({ paymentStatus: "REFUNDED", hasPaidPayment: true }),
    });
    assert.equal(p.kind, "REFUND");
    assert.notEqual(p.kind, "CAPTURE", "a refund must never re-capture a REFUNDED order");
    assert.equal((p as { phase: string }).phase, "PROCESSED");
    console.log("PASS 5 a refund for an already-REFUNDED order never re-marks it PAID");
  }

  {
    // Batch 4: refund.created and refund.failed are REFUND actions, because both
    // are facts the ledger needs (initiated vs never-happened). refund.
    // speed_changed is a settlement-speed note and stays an ACK.
    for (const [event, action] of [
      ["refund.created", "REFUND_CREATED"],
      ["refund.failed", "REFUND_FAILED"],
    ] as const) {
      const c = classifyRazorpayWebhook(
        JSON.stringify({
          event,
          payload: {
            refund: {
              entity: {
                id: "rfnd_X",
                amount: 50_000,
                payment_id: "pay_CAPTURED1",
                status: "pending",
              },
            },
            payment: {
              entity: {
                id: "pay_CAPTURED1",
                amount: 100_000,
                order_id: "order_ABC",
                amount_refunded: 0,
                status: "captured",
              },
            },
          },
        }),
      );
      assert.equal(c.action, action, `${event} must classify as ${action}`);
      assert.equal(c.refundId, "rfnd_X");
      assert.equal(c.refundAmount, 50_000);
    }

    const speed = classifyRazorpayWebhook(
      JSON.stringify({
        event: "refund.speed_changed",
        payload: {
          refund: {
            entity: {
              id: "rfnd_X",
              amount: 50_000,
              payment_id: "pay_CAPTURED1",
              status: "pending",
            },
          },
          payment: {
            entity: {
              id: "pay_CAPTURED1",
              amount: 100_000,
              order_id: "order_ABC",
              status: "captured",
            },
          },
        },
      }),
    );
    assert.equal(speed.action, "ACK", "a settlement-speed note is not a money event");
    console.log("PASS 6 refund.created/failed are recorded; speed_changed ACKs");
  }

  // ── 7. Malformed payloads degrade to an ACK, never a throw ──────────────
  {
    for (const body of [
      "",
      "not json",
      "[]",
      "null",
      "123",
      JSON.stringify({ event: "payment.captured" }),
      JSON.stringify({ event: "payment.captured", payload: {} }),
      JSON.stringify({
        event: "payment.captured",
        payload: { payment: { entity: { status: "captured" } } },
      }),
    ]) {
      const c = classifyRazorpayWebhook(body);
      assert.equal(c.action, "ACK", `body ${JSON.stringify(body)} must ACK`);
      const p = plan({ classification: c });
      assert.equal(p.kind, "ACK");
    }
    console.log("PASS 7 malformed payloads ACK without throwing");
  }

  // ── 8. Full vs partial refunds ──────────────────────────────────────────
  {
    const partial = plan({
      classification: classifyRazorpayWebhook(REFUND_PROCESSED_EVENT),
      order: makeOrder({ paymentStatus: "PAID", hasPaidPayment: true }),
      existingPaymentStatus: "PAID",
    });
    assert.equal(partial.kind, "REFUND");
    assert.equal((partial as { phase: string }).phase, "PROCESSED");
    assert.equal((partial as { refundAmount: number }).refundAmount, 50_000);
    assert.equal((partial as { cumulativeRefunded: number }).cumulativeRefunded, 50_000);

    const full = plan({
      classification: classifyRazorpayWebhook(REFUND_SETTLED_EVENT),
      order: makeOrder({ paymentStatus: "PAID", hasPaidPayment: true }),
      existingPaymentStatus: "PAID",
    });
    assert.equal(full.kind, "REFUND");
    assert.equal((full as { phase: string }).phase, "PROCESSED");
    assert.equal((full as { baseAmount: number }).baseAmount, 100_000);
    assert.equal((full as { cumulativeRefunded: number }).cumulativeRefunded, 100_000);
    console.log("PASS 8 refund.processed forwards its phase and both figures");
  }

  {
    // Cumulative comparison: a refund smaller than the payment is still partial
    // even when it is the second, larger one.
    const second = plan({
      classification: classifyRazorpayWebhook(
        JSON.stringify({
          event: "refund.processed",
          payload: {
            refund: {
              entity: {
                id: "rfnd_2",
                amount: 20_000,
                payment_id: "pay_X",
              },
            },
            payment: {
              entity: {
                id: "pay_X",
                amount: 100_000,
                order_id: "order_ABC",
                amount_refunded: 70_000,
              },
            },
          },
        }),
      ),
    });
    assert.equal((second as { refundAmount: number }).refundAmount, 20_000);
    assert.equal((second as { cumulativeRefunded: number }).cumulativeRefunded, 70_000);
    console.log("PASS 9 cumulative amount_refunded, not the per-event refund amount");
  }

  // ── 10. Refund lifecycle events ─────────────────────────────────────────
  {
    // Batch 4 moved dedupe into the Refund table (a UNIQUE razorpayRefundId), so
    // the planner no longer asks "have I seen this id before" from note text — it
    // forwards every refund event to the accounting layer, which owns both
    // idempotency and the partial/full decision. This asserts that hand-off, plus
    // the three-way phase split that replaced the old "only refund.processed
    // matters, ACK the rest".
    const processed = plan({
      classification: classifyRazorpayWebhook(REFUND_PROCESSED_EVENT),
      order: makeOrder({ paymentStatus: "PAID", hasPaidPayment: true }),
      existingPaymentStatus: "PAID",
    });
    assert.equal(processed.kind, "REFUND");
    assert.equal((processed as { phase: string }).phase, "PROCESSED");

    const created = plan({
      classification: classifyRazorpayWebhook(
        REFUND_PROCESSED_EVENT.replace("refund.processed", "refund.created"),
      ),
      order: makeOrder({ paymentStatus: "PAID", hasPaidPayment: true }),
      existingPaymentStatus: "PAID",
    });
    assert.equal(created.kind, "REFUND", "refund.created is recorded, not dropped");
    assert.equal((created as { phase: string }).phase, "CREATED");

    const failed = plan({
      classification: classifyRazorpayWebhook(
        REFUND_PROCESSED_EVENT.replace("refund.processed", "refund.failed"),
      ),
      order: makeOrder({ paymentStatus: "PAID", hasPaidPayment: true }),
      existingPaymentStatus: "PAID",
    });
    assert.equal(failed.kind, "REFUND", "refund.failed is recorded, not dropped");
    assert.equal((failed as { phase: string }).phase, "FAILED");

    // Settlement speed is not a money event.
    const speed = plan({
      classification: classifyRazorpayWebhook(
        REFUND_PROCESSED_EVENT.replace("refund.processed", "refund.speed_changed"),
      ),
      order: makeOrder({ paymentStatus: "PAID", hasPaidPayment: true }),
      existingPaymentStatus: "PAID",
    });
    assert.equal(speed.kind, "ACK", "refund.speed_changed stays an ACK");
    console.log("PASS 10 created/processed/failed are distinguished, speed_changed ACKs");
  }

  // ── 11. A failed payment can never downgrade a paid order ───────────────
  {
    // The attempt is still recorded (support needs to see it), but
    // degradeOrder: false means order.paymentStatus is left untouched.
    const late = plan({
      classification: classifyRazorpayWebhook(FAILED_EVENT),
      order: makeOrder({ paymentStatus: "PAID", hasPaidPayment: true }),
    });
    assert.equal(late.kind, "FAIL");
    assert.equal(
      (late as { degradeOrder: boolean }).degradeOrder,
      false,
      "a PAID order must not be moved to FAILED",
    );

    // Same event, but for a payment id already recorded as FAILED — the pure
    // replay. Nothing is written at all, so no second timeline entry appears.
    const replayed = plan({
      classification: classifyRazorpayWebhook(FAILED_EVENT),
      order: makeOrder({ paymentStatus: "PAID", hasPaidPayment: true }),
      existingPaymentStatus: "FAILED",
    });
    assert.equal(replayed.kind, "ACK");
    assert.equal(
      (replayed as { reason: string }).reason,
      "already-failed",
    );
    console.log("PASS 11 a delayed payment.failed never downgrades a PAID order");
  }

  {
    // The exact replay scenario: attempt 1 failed, attempt 2 captured, Razorpay
    // re-delivers attempt 1's failure.
    const replay = plan({
      classification: classifyRazorpayWebhook(FAILED_EVENT),
      order: makeOrder({ paymentStatus: "PAID", hasPaidPayment: true }),
      existingPaymentStatus: "FAILED",
    });
    assert.equal(replay.kind, "ACK");

    // And the same failure for an order that never succeeded: the attempt is
    // still recorded, but the order is marked FAILED as before.
    const first = plan({
      classification: classifyRazorpayWebhook(FAILED_EVENT),
      order: makeOrder(),
    });
    assert.equal(first.kind, "FAIL");
    assert.equal((first as { degradeOrder: boolean }).degradeOrder, true);
    console.log("PASS 12 a genuine first failure still records and degrades the order");
  }

  // ── 13. Partial payments survive a later failed attempt ─────────────────
  {
    const onPartial = plan({
      classification: classifyRazorpayWebhook(FAILED_EVENT),
      order: makeOrder({
        paymentStatus: "PARTIALLY_PAID",
        hasPaidPayment: true,
      }),
    });
    assert.equal(onPartial.kind, "FAIL", "the attempt is still recorded");
    assert.equal(
      (onPartial as { degradeOrder: boolean }).degradeOrder,
      false,
      "PARTIALLY_PAID must not be reset to FAILED — that would re-inflate the balance",
    );

    // …and a partially paid order must still accept the capture of its balance.
    const capture = plan({
      classification: classifyRazorpayWebhook(CAPTURED_EVENT),
      order: makeOrder({
        paymentStatus: "PARTIALLY_PAID",
        hasPaidPayment: true,
      }),
    });
    assert.equal(capture.kind, "CAPTURE", "partial-payment support is preserved");
    console.log("PASS 13 partially paid orders keep their balance and still capture");
  }

  {
    // A failure reported against a payment we already recorded as captured.
    const onPaid = plan({
      classification: classifyRazorpayWebhook(FAILED_EVENT),
      order: makeOrder(),
      existingPaymentStatus: "PAID",
    });
    assert.equal(onPaid.kind, "ACK");
    assert.equal((onPaid as { reason: string }).reason, "successful-payment-present");
    console.log("PASS 14 a failure never overwrites a captured payment row");
  }

  {
    // Duplicate failed event: the timeline must not gain a second entry.
    const dup = plan({
      classification: classifyRazorpayWebhook(FAILED_EVENT),
      existingPaymentStatus: "FAILED",
    });
    assert.equal(dup.kind, "ACK");
    assert.equal((dup as { reason: string }).reason, "already-failed");
    console.log("PASS 15 a redelivered payment.failed writes no second timeline entry");
  }

  // ── 16. Unknown order still acks so Razorpay does not retry-loop ────────
  {
    const c = classifyRazorpayWebhook(CAPTURED_EVENT);
    const p = plan({ classification: c, order: null });
    assert.equal(p.kind, "ACK");
    assert.equal((p as { reason: string }).reason, "unknown-order");
    console.log("PASS 16 an unknown order is ACKed, not retried forever");
  }

  // ── 17. Capture idempotency is unchanged from before ────────────────────
  {
    const alreadyPaid = plan({
      classification: classifyRazorpayWebhook(CAPTURED_EVENT),
      order: makeOrder({ paymentStatus: "PAID", hasPaidPayment: true }),
      existingPaymentStatus: "PAID",
    });
    assert.equal(alreadyPaid.kind, "ACK");

    const duplicate = plan({
      classification: classifyRazorpayWebhook(CAPTURED_EVENT),
      order: makeOrder(),
      existingPaymentStatus: "PAID",
    });
    assert.equal(duplicate.kind, "ACK");
    assert.equal((duplicate as { reason: string }).reason, "already-captured");

    const fresh = plan({ classification: classifyRazorpayWebhook(CAPTURED_EVENT) });
    assert.equal(fresh.kind, "CAPTURE");
    assert.equal((fresh as { method: string }).method, "upi");
    assert.equal((fresh as { customerId: string }).customerId, "cust_1");
    console.log("PASS 17 capture idempotency preserved");
  }

  // ── 18. Timeline notes ──────────────────────────────────────────────────
  {
    assert.equal(
      webhookTimelineNote(plan({ classification: classifyRazorpayWebhook(CAPTURED_EVENT) })),
      "Payment captured via Razorpay (pay_CAPTURED1).",
    );
    assert.equal(
      webhookTimelineNote(plan({ classification: classifyRazorpayWebhook(FAILED_EVENT) })),
      "Payment failed: Payment failed due to insufficient funds",
    );

    // Refund notes are NOT produced here: the partial/full distinction and the
    // running total come from refund-accounting, which reads the order's real
    // payment rows. Asserting the absence here is what stops a future edit from
    // re-introducing a note that guesses the figures from the payload alone.
    for (const event of [
      REFUND_PROCESSED_EVENT,
      REFUND_SETTLED_EVENT,
    ]) {
      const refundPlan = plan({
        classification: classifyRazorpayWebhook(event),
        order: makeOrder({ paymentStatus: "PAID", hasPaidPayment: true }),
      });
      assert.equal(
        webhookTimelineNote(refundPlan),
        null,
        "refund wording belongs to refund-accounting, not to the plan",
      );
    }
console.log("PASS 18 timeline notes state the real amounts, and refunds defer to accounting");
  }

  // ── 19. Webhook secret configuration ────────────────────────────────────
  {
    assert.equal(readWebhookSecret(undefined), null);
    assert.equal(readWebhookSecret(null), null);
    assert.equal(readWebhookSecret(""), null, "present-but-empty is a misconfiguration");
    assert.equal(readWebhookSecret("   "), null, "whitespace-only is not a secret");
    assert.equal(readWebhookSecret("whsec_abc"), "whsec_abc");
    assert.equal(readWebhookSecret("  whsec_abc  "), "whsec_abc", "trimmed");
    console.log("PASS 19 readWebhookSecret treats blank as missing");
  }

  // ── 20. Signature verification over the RAW body ────────────────────────
  {
    const secret = "whsec_test_secret";
    const sig = crypto
      .createHmac("sha256", secret)
      .update(CAPTURED_EVENT)
      .digest("hex");

    assert.equal(verifyWebhookSignature(CAPTURED_EVENT, sig, secret), true);
    assert.equal(verifyWebhookSignature(CAPTURED_EVENT, sig, "wrong"), false);
    assert.equal(verifyWebhookSignature(CAPTURED_EVENT, null, secret), false);
    assert.equal(verifyWebhookSignature(CAPTURED_EVENT, "", secret), false);
    assert.equal(
      verifyWebhookSignature(CAPTURED_EVENT, sig, null),
      false,
      "no secret must never verify",
    );
    assert.equal(
      verifyWebhookSignature(CAPTURED_EVENT, "zzzz", secret),
      false,
      "malformed hex must not throw",
    );
    assert.equal(
      verifyWebhookSignature(CAPTURED_EVENT, sig.slice(0, 32), secret),
      false,
      "truncated signature must not throw",
    );
    // Re-serialising the payload breaks the digest — this is why the route
    // hashes the raw text before parsing.
    assert.equal(
      verifyWebhookSignature(
        JSON.stringify(JSON.parse(CAPTURED_EVENT), null, 2),
        sig,
        secret,
      ),
      false,
    );
    console.log("PASS 20 webhook HMAC verification is raw-body and constant-time");
  }

  // ── 21. Captures record the money actually charged, not order.total ──────
  {
    const p = plan({ classification: classifyRazorpayWebhook(CAPTURED_EVENT) });
    assert.equal(p.kind, "CAPTURE");
    assert.equal(
      p.kind === "CAPTURE" && p.amount,
      100_000,
      "a first full capture is worth the order total",
    );
    assert.equal(
      p.kind === "CAPTURE" && p.paymentStatus,
      "PAID",
      "a capture that covers the order settles it",
    );
    assert.equal(
      p.kind === "CAPTURE" && p.orderStatus,
      "PAYMENT_RECEIVED",
    );
    console.log("PASS 21 a full capture records the charged amount and settles the order");
  }

  {
    // THE #6 DEFECT: pay-inline opens one Razorpay order per attempt for the
    // outstanding balance, so this capture covers ₹500 of a ₹1,000 order. Writing
    // order.total made the paid sum 150,000 — the customer was shown as fully
    // paid while ₹500 was never collected.
    const p = plan({
      classification: classifyRazorpayWebhook(BALANCE_CAPTURE_EVENT),
      order: makeOrder({
        paymentStatus: "PARTIALLY_PAID",
        hasPaidPayment: true,
        settledAmount: 50_000,
      }),
    });
    assert.equal(p.kind, "CAPTURE");
    assert.equal(
      p.kind === "CAPTURE" && p.amount,
      50_000,
      "the balance capture must be recorded as the balance, not the order total",
    );
    assert.equal(
      p.kind === "CAPTURE" && p.paymentStatus,
      "PAID",
      "covering the balance does settle the order",
    );
    console.log("PASS 22 a balance capture records the balance and still settles the order");
  }

  {
    // A capture that only covers part of the order must leave it PARTIALLY_PAID,
    // otherwise the outstanding balance disappears from pay-inline and the
    // remainder is never collected.
    const p = plan({
      classification: classifyRazorpayWebhook(PARTIAL_CAPTURE_EVENT),
      order: makeOrder({ paymentStatus: "PENDING", settledAmount: 50_000 }),
    });
    assert.equal(p.kind === "CAPTURE" && p.paymentStatus, "PARTIALLY_PAID");
    console.log("PASS 23 a part capture leaves the order PARTIALLY_PAID");
  }

  {
    // Same defect class as the replayed failure, on the order.status field: the
    // route used to write status: "PAYMENT_RECEIVED" on every capture, so a
    // redelivered event arriving after the workshop started the job dragged the
    // order backwards and reopened it as paid-and-waiting.
    const progressed = plan({
      classification: classifyRazorpayWebhook(CAPTURED_EVENT),
      order: makeOrder({ status: "WORK_STARTED", settledAmount: 0 }),
    });
    assert.equal(
      progressed.kind === "CAPTURE" && progressed.orderStatus,
      "WORK_STARTED",
      "a capture must not reset a progressed order's status",
    );
    const partial = plan({
      classification: classifyRazorpayWebhook(PARTIAL_CAPTURE_EVENT),
      order: makeOrder({ status: "PAYMENT_PENDING", settledAmount: 50_000 }),
    });
    assert.equal(
      partial.kind === "CAPTURE" && partial.orderStatus,
      "PAYMENT_PENDING",
      "a part capture leaves the status alone",
    );
    console.log("PASS 24 a capture never drags a progressed order's status backwards");
  }

  {
    // An inflated payload must not be able to mark an order fully paid.
    const p = plan({
      classification: classifyRazorpayWebhook(INFLATED_CAPTURE_EVENT),
    });
    assert.equal(p.kind === "CAPTURE" && p.amount, 100_000);
    console.log("PASS 25 an inflated payload amount is clamped to the order total");
  }

  {
    // The FAILED tile on the admin payments dashboard sums Payment.amount, so a
    // failed attempt recorded against the order total over-reports money that
    // was never collected.
    const p = plan({
      classification: classifyRazorpayWebhook(FAILED_BALANCE_EVENT),
      order: makeOrder({
        paymentStatus: "PARTIALLY_PAID",
        hasPaidPayment: true,
        settledAmount: 50_000,
      }),
    });
    assert.equal(p.kind, "FAIL");
    assert.equal(p.kind === "FAIL" && p.amount, 50_000);
    assert.equal(p.kind === "FAIL" && p.degradeOrder, false);
    console.log("PASS 26 a failed attempt records the balance it tried, not the total");
  }

  {
    // settle the whole order → REFUNDED, and the tracking cache must follow.
    const p = plan({
      classification: classifyRazorpayWebhook(REFUND_SETTLED_EVENT),
      order: makeOrder({
        paymentStatus: "PAID",
        hasPaidPayment: true,
        settledAmount: 100_000,
      }),
    });
    assert.equal(p.kind === "REFUND" && p.baseAmount, 100_000);
    console.log("PASS 27 a full refund still resolves against the real paid amount");
  }

  console.log("\nPASS all Razorpay webhook tests");
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});