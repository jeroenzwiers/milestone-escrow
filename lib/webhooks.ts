// Applies PayPal webhook events to milestones. Status updates are idempotent;
// PayPal may deliver an event more than once.
import { findMilestone, isEventProcessed, logEvent, markEventProcessed, updateMilestone } from "./store";

type WebhookEvent = { id: string; event_type: string; resource: Record<string, any> };

// Only successfully processed events count as seen: if processing fails, PayPal's
// retry must be processed again rather than dropped as a duplicate. Processed ids are
// kept in the storage backend, so they survive restarts when it is Postgres.
const inFlight = new Map<string, Promise<string>>();

export async function handlePayPalEvent(event: WebhookEvent): Promise<string> {
  if (await isEventProcessed(event.id)) return "duplicate";
  const running = inFlight.get(event.id);
  if (running) return running;

  const work = applyEvent(event);
  inFlight.set(event.id, work);
  try {
    const result = await work;
    await markEventProcessed(event.id);
    return result;
  } finally {
    inFlight.delete(event.id);
  }
}

async function applyEvent(event: WebhookEvent): Promise<string> {
  const r = event.resource ?? {};

  if (event.event_type.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
    return setPayoutStatus(r.payout_batch_id, r.transaction_status, event.event_type);
  }
  if (event.event_type.startsWith("PAYMENT.PAYOUTSBATCH.")) {
    return setPayoutStatus(r.batch_header?.payout_batch_id, r.batch_header?.batch_status, event.event_type);
  }
  if (event.event_type === "CUSTOMER.DISPUTE.CREATED") {
    const captureIds: string[] = (r.disputed_transactions ?? []).map((t: { seller_transaction_id?: string }) => t.seller_transaction_id).filter(Boolean);
    const m = await findMilestone((x) => !!x.captureId && captureIds.includes(x.captureId));
    if (!m) return "no matching milestone";
    await updateMilestone(m.id, (x) => logEvent(x, "paypal_dispute_opened", `${r.dispute_id}: ${r.reason ?? "no reason given"}`));
    return "logged dispute";
  }
  return "ignored";
}

async function setPayoutStatus(batchId: string | undefined, status: string | undefined, eventType: string) {
  if (!batchId || !status) return "missing payout data";
  const m = await findMilestone((x) => x.payout?.batchId === batchId);
  if (!m) return "no matching milestone";
  await updateMilestone(m.id, (x) => {
    if (x.payout!.status === status) return;
    x.payout!.status = status;
    logEvent(x, "payout_update", `${eventType}: ${status}`);
  });
  return `payout ${status}`;
}
