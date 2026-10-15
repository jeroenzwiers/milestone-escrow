// Escrow state machine on top of PayPal. Every money movement goes through
// here so the AI agent (week 2+) and the UI share the same guardrails.
import * as paypal from "./paypal";
import { providerEmail } from "./providers";
import { getMilestone, getProject, logEvent, updateMilestone, updateProject, type Milestone, type Project } from "./store";

const FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT ?? 5);

// Statuses in which the platform holds the client's money and it can be settled.
// Not "in_review": wait for the reviewer to finish before money moves.
export const HELD: ReadonlySet<Milestone["status"]> = new Set(["funded", "changes_requested", "needs_review", "verified", "disputed"]);

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

async function projectOf(m: Milestone): Promise<Project> {
  const p = await getProject(m.projectId);
  if (!p) throw new EscrowError(`Project ${m.projectId} not found`, 404);
  return p;
}

/** Who is paid for a milestone: its provider in team mode, otherwise the project's freelancer. */
export function payeeOf(m: Milestone, project: Project): string {
  return m.providerId ? providerEmail(m.providerId) : project.freelancerEmail;
}

export function platformFee(amountCents: number): number {
  return Math.round((amountCents * FEE_PERCENT) / 100);
}

/** Client starts paying a milestone: creates the PayPal order. */
export function startFunding(id: string, urls?: { returnUrl: string; cancelUrl: string }) {
  return withLock(id, async () => {
    const m = await mustGet(id);
    const project = await projectOf(m);
    if (project.status !== "active") throw new EscrowError("Both parties must approve the plan before milestones can be funded");
    if (m.status !== "draft" && m.status !== "awaiting_funding") {
      throw new EscrowError(`Milestone ${id} cannot be funded in status ${m.status}`);
    }
    const order = await paypal.createOrder({
      referenceId: m.id,
      description: `${project.title}: ${m.title}`,
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

/** Team mode: the client funds every unfunded milestone of the approved plan with one PayPal order. */
export function startPlanFunding(projectId: string, urls?: { returnUrl: string; cancelUrl: string }) {
  return withLock(`p:${projectId}`, async () => {
    const project = await getProject(projectId);
    if (!project) throw new EscrowError("Project not found", 404);
    if (project.mode !== "team") throw new EscrowError("Only team plans are funded as a whole");
    if (project.status !== "active") throw new EscrowError("Approve the plan before funding it");
    const open = project.milestones.filter((m) => m.status === "draft" || m.status === "awaiting_funding");
    if (open.length === 0) throw new EscrowError("Every milestone of this plan is already funded");
    const total = open.reduce((n, m) => n + m.amountCents, 0);
    const order = await paypal.createOrder({
      referenceId: project.id,
      description: `${project.title}: plan v${project.plan?.version ?? 1}`,
      amountCents: total,
      currency: project.currency,
      ...urls,
    });
    await updateProject(projectId, (p, ms) => {
      p.plan!.orderId = order.id;
      for (const m of ms) {
        if (!open.some((o) => o.id === m.id)) continue;
        m.orderId = order.id;
        m.status = "awaiting_funding";
      }
      logEvent(p, "plan_order_created", `${order.id}: ${paypal.formatAmount(total)} ${p.currency} for ${open.length} milestones`);
    });
    return order;
  });
}

/** Team mode: capture the plan order; every milestone in it is then held against that one capture. */
export function confirmPlanFunding(projectId: string, orderId: string) {
  return withLock(`p:${projectId}`, async () => {
    const project = await getProject(projectId);
    if (!project) throw new EscrowError("Project not found", 404);
    if (project.plan?.orderId !== orderId) throw new EscrowError("Order does not belong to this plan");
    const pending = project.milestones.filter((m) => m.orderId === orderId && m.status === "awaiting_funding");
    if (pending.length === 0) return project;

    const order = await paypal.captureOrder(orderId);
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    if (order.status !== "COMPLETED" || !capture || capture.status !== "COMPLETED") {
      throw new EscrowError(`Capture not completed (order ${order.status}, capture ${capture?.status ?? "missing"})`, 502);
    }
    return updateProject(projectId, (p, ms) => {
      for (const m of ms) {
        if (m.orderId !== orderId || m.status !== "awaiting_funding") continue;
        m.captureId = capture.id;
        m.status = "funded";
        logEvent(m, "funded", `capture ${capture.id} (plan funding)`);
      }
      logEvent(p, "plan_funded", `capture ${capture.id}`);
    });
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
    if (!HELD.has(m.status)) throw new EscrowError(`Milestone ${id} is ${m.status}; there are no funds to settle`);
    if (!m.captureId) throw new EscrowError(`Milestone ${id} has no capture`);
    if (!Number.isInteger(freelancerShareCents) || freelancerShareCents < 0 || freelancerShareCents > m.amountCents) {
      throw new EscrowError(`Freelancer share must be between 0 and ${m.amountCents} cents`);
    }
    const project = await projectOf(m);
    const payee = payeeOf(m, project);
    if (freelancerShareCents > 0 && !payee) {
      throw new EscrowError(m.providerId ? `No PayPal account configured for provider ${m.providerId}` : "The project has no freelancer PayPal email");
    }

    const refundCents = m.amountCents - freelancerShareCents;

    // Skip steps that already succeeded, so a retry after a partial failure is safe.
    if (freelancerShareCents > 0 && !m.payout) {
      const feeCents = platformFee(freelancerShareCents);
      const payoutCents = freelancerShareCents - feeCents;
      const batch = await paypal.createPayout({
        senderBatchId: `ms-${m.id}-${m.captureId}`,
        receiverEmail: payee,
        amountCents: payoutCents,
        currency: m.currency,
        note: `Payment for "${m.title}" (${project.title}). ${reason}`.slice(0, 255),
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

/** Poll PayPal for the latest payout status (fallback for when webhooks can't reach us, e.g. localhost). */
export async function refreshPayout(id: string) {
  const m = await mustGet(id);
  if (!m.payout) return m;
  const batch = await paypal.getPayoutBatch(m.payout.batchId);
  return updateMilestone(id, (x) => {
    x.payout!.status = batch.batch_header.batch_status;
  });
}
