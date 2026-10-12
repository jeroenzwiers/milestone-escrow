// Applies PayPal webhook events to milestones. Status updates are idempotent;
// PayPal may deliver an event more than once.
import { findMilestone, logEvent, updateMilestone } from "./store";

type WebhookEvent = { id: string; event_type: string; resource: Record<string, any> };

const seen = new Set<string>();

export async function handlePayPalEvent(event: WebhookEvent): Promise<string> {
  if (seen.has(event.id)) return "duplicate";
  seen.add(event.id);
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
