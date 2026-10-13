// End-to-end test of the team money flow against the PayPal sandbox:
//   one payment for the whole plan → each milestone paid out to its own provider's
//   sandbox account (one as a split, so part is refunded) → payout statuses checked.
// Needs one manual step: approving the payment with the client's sandbox account.
// Uses a temporary local store, so nothing is written to the project's database.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATABASE_URL = "";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "team-e2e-"));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // Imported after the environment is set, so the store uses the temporary directory.
  const { createTeamDemo } = await import("../lib/team");
  const { approvePlan } = await import("../lib/projects");
  const { startPlanFunding, confirmPlanFunding, settle } = await import("../lib/escrow");
  const paypal = await import("../lib/paypal");
  const { getProject } = await import("../lib/store");
  const { providerEmail } = await import("../lib/providers");

  const { projectId } = await createTeamDemo();
  await approvePlan(projectId, "client");
  let project = (await getProject(projectId))!;
  console.log("1. Team plan approved:");
  for (const m of project.milestones) console.log(`   - ${m.title.slice(0, 50)} · ${m.providerId} → ${providerEmail(m.providerId!) || "(no account set!)"} · €${(m.amountCents / 100).toFixed(2)}`);
  const missing = project.milestones.filter((m) => !providerEmail(m.providerId!));
  if (missing.length) throw new Error(`Set the sandbox email for: ${missing.map((m) => m.providerId).join(", ")}`);

  const order = await startPlanFunding(projectId);
  const link = paypal.approveLink(await paypal.getOrder(order.id));
  console.log(`\n2. One order for the whole plan: ${order.id}\n\n   ➜ Open this link and pay with the CLIENT sandbox account (sb-ychkk…):\n   ${link}\n`);

  console.log("3. Waiting for approval (max 10 min)…");
  const deadline = Date.now() + 10 * 60_000;
  while ((await paypal.getOrder(order.id)).status !== "APPROVED") {
    if (Date.now() > deadline) throw new Error("Order not approved in time");
    await wait(3000);
  }
  project = await confirmPlanFunding(projectId, order.id);
  console.log(`   captured once: ${project.milestones[0].captureId} for all ${project.milestones.length} milestones`);

  console.log("\n4. Settling each milestone with its own provider:");
  const [first, second, third] = project.milestones;
  await settle(first.id, first.amountCents, "verified");
  await settle(second.id, Math.round(second.amountCents * 0.7), "split 70/30 after mediation");
  await settle(third.id, third.amountCents, "verified");

  await wait(5000);
  project = (await getProject(projectId))!;
  for (const m of project.milestones) {
    let status = m.payout?.status ?? "-";
    if (m.payout) {
      for (let i = 0; i < 10 && (status === "PENDING" || status === "PROCESSING"); i++) {
        await wait(3000);
        const batch = await paypal.getPayoutBatch(m.payout.batchId);
        status = batch.batch_header.batch_status;
      }
      const batch = await paypal.getPayoutBatch(m.payout.batchId);
      const item = batch.items?.[0] as { transaction_status?: string; payout_item?: { receiver?: string } } | undefined;
      console.log(`   - ${(m.providerId ?? "").padEnd(12)} paid €${(m.payout.amountCents / 100).toFixed(2)} (fee €${(m.payout.feeCents / 100).toFixed(2)}) to ${item?.payout_item?.receiver ?? "?"} · batch ${status} · item ${item?.transaction_status ?? "?"}`);
    }
    if (m.refund) console.log(`   - ${(m.providerId ?? "").padEnd(12)} refunded €${(m.refund.amountCents / 100).toFixed(2)} to the client · ${m.refund.status}`);
  }
  const receivers = new Set(project.milestones.map((m) => providerEmail(m.providerId!)));
  console.log(`\n✔ One payment, ${project.milestones.length} payouts to ${receivers.size} different sandbox accounts, one partial refund.`);
}

main().catch((err) => {
  console.error("\n✘", err.message);
  if (err.details) console.error(JSON.stringify(err.details, null, 2));
  process.exit(1);
});
