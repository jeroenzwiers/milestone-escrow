// Escrow state machine on top of PayPal. Every money movement goes through
// here so the AI agent (week 2+) and the UI share the same guardrails.
import * as paypal from "./paypal";
import { getMilestone, logEvent, updateMilestone, type Milestone } from "./store";

const FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT ?? 5);

// One money operation per milestone at a time (single-process; fine for the demo).
const locks = new Set<string>();
async function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  if (locks.has(id)) throw new EscrowError(`Milestone ${id} is already being processed`, 409);
  locks.add(id);
  try {
    return await fn();
  } finally {
    locks.delete(id);
  }
}

export class EscrowError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

async function mustGet(id: string): Promise<Milestone> {
  const m = await getMilestone(id);
  if (!m) throw new EscrowError(`Milestone ${id} not found`, 404);
  return m;
}

export function platformFee(amountCents: number): number {
  return Math.round((amountCents * FEE_PERCENT) / 100);
}

/** Client starts paying a milestone: creates the PayPal order. */
export function startFunding(id: string, urls?: { returnUrl: string; cancelUrl: string }) {
  return withLock(id, async () => {
    const m = await mustGet(id);
    if (m.status !== "draft" && m.status !== "awaiting_funding") {
      throw new EscrowError(`Milestone ${id} cannot be funded in status ${m.status}`);
    }
    const order = await paypal.createOrder({
      referenceId: m.id,
      description: `${m.projectTitle}: ${m.title}`,
      amountCents: m.amountCents,
      currency: m.currency,
      ...urls,
    });
    await updateMilestone(id, (x) => {
      x.orderId = order.id;
      x.status = "awaiting_funding";
      logEvent(x, "order_created", order.id);
    });
    return order;
  });
}

/** Client approved the payment: capture it so the platform holds the funds. */
export function confirmFunding(id: string, orderId: string) {
  return withLock(id, async () => {
    const m = await mustGet(id);
    if (m.orderId !== orderId) throw new EscrowError("Order does not belong to this milestone");
    if (m.status === "funded") return m;
    if (m.status !== "awaiting_funding") throw new EscrowError(`Milestone ${id} is ${m.status}`);

    const order = await paypal.captureOrder(orderId);
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    if (order.status !== "COMPLETED" || !capture || capture.status !== "COMPLETED") {
      throw new EscrowError(`Capture not completed (order ${order.status}, capture ${capture?.status ?? "missing"})`, 502);
    }
    return updateMilestone(id, (x) => {
      x.captureId = capture.id;
      x.status = "funded";
      logEvent(x, "funded", `capture ${capture.id}`);
    });
  });
}

/**
 * Settle a funded milestone: pay `freelancerShareCents` out to the freelancer
 * (minus platform fee) and refund the rest to the client.
 * Full release = whole amount, full refund = 0, anything between = a split.
 */
export function settle(id: string, freelancerShareCents: number, reason: string) {
  return withLock(id, async () => {
    const m = await mustGet(id);
    if (m.status !== "funded") throw new EscrowError(`Milestone ${id} is ${m.status}, not funded`);
    if (!m.captureId) throw new EscrowError(`Milestone ${id} has no capture`);
    if (!Number.isInteger(freelancerShareCents) || freelancerShareCents < 0 || freelancerShareCents > m.amountCents) {
      throw new EscrowError(`Freelancer share must be between 0 and ${m.amountCents} cents`);
    }
    if (freelancerShareCents > 0 && !m.freelancerEmail) {
      throw new EscrowError("No freelancer PayPal email configured (FREELANCER_PAYPAL_EMAIL)");
    }

    const refundCents = m.amountCents - freelancerShareCents;

    // Skip steps that already succeeded, so a retry after a partial failure is safe.
    if (freelancerShareCents > 0 && !m.payout) {
      const feeCents = platformFee(freelancerShareCents);
      const payoutCents = freelancerShareCents - feeCents;
      const batch = await paypal.createPayout({
        senderBatchId: `ms-${m.id}-${m.captureId}`,
        receiverEmail: m.freelancerEmail,
        amountCents: payoutCents,
        currency: m.currency,
        note: `Payment for "${m.title}" (${m.projectTitle}). ${reason}`.slice(0, 255),
      });
      await updateMilestone(id, (x) => {
        x.payout = { batchId: batch.batch_header.payout_batch_id, amountCents: payoutCents, feeCents, status: batch.batch_header.batch_status };
        logEvent(x, "payout_sent", `${paypal.formatAmount(payoutCents)} ${x.currency} (fee ${paypal.formatAmount(feeCents)})`);
      });
    }

    if (refundCents > 0 && !m.refund) {
      const refund = await paypal.refundCapture(m.captureId, refundCents, m.currency, `refund-${m.id}-${m.captureId}`);
      await updateMilestone(id, (x) => {
        x.refund = { id: refund.id, amountCents: refundCents, status: refund.status };
        logEvent(x, "refund_sent", `${paypal.formatAmount(refundCents)} ${x.currency}`);
      });
    }

    return updateMilestone(id, (x) => {
      x.status = refundCents === 0 ? "released" : freelancerShareCents === 0 ? "refunded" : "split";
      logEvent(x, x.status, reason);
    });
  });
}

/** Poll PayPal for the latest payout status (webhooks replace this in week 3). */
export async function refreshPayout(id: string) {
  const m = await mustGet(id);
  if (!m.payout) return m;
  const batch = await paypal.getPayoutBatch(m.payout.batchId);
  return updateMilestone(id, (x) => {
    x.payout!.status = batch.batch_header.batch_status;
  });
}
