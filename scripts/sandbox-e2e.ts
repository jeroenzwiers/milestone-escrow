// End-to-end test of the escrow money flow against the PayPal sandbox:
//   client pays 20.00 → platform captures → 70% paid out to freelancer (minus fee) → 30% refunded.
// Needs one manual step: approving the payment with a sandbox *personal* (buyer) account.
// Uses the PayPal client directly, so it doesn't touch the app's demo data.
import * as paypal from "../lib/paypal";

const CURRENCY = process.env.CURRENCY ?? "USD";
const FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT ?? 5);
const AMOUNT = 2000;
const SHARE = 1400;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const freelancer = process.env.FREELANCER_PAYPAL_EMAIL;
  if (!freelancer) throw new Error("FREELANCER_PAYPAL_EMAIL is not set");
  const runId = `e2e-${Date.now()}`;

  console.log("1. Creating order…");
  const order = await paypal.createOrder({
    referenceId: runId,
    description: "Escrow e2e test milestone",
    amountCents: AMOUNT,
    currency: CURRENCY,
    returnUrl: "https://example.com/approved",
    cancelUrl: "https://example.com/cancelled",
  });
  console.log(`   order ${order.id}\n\n   ➜ Open this link and pay with a sandbox PERSONAL account (not the freelancer):\n   ${paypal.approveLink(order)}\n`);

  console.log("2. Waiting for approval (max 10 min)…");
  const deadline = Date.now() + 10 * 60_000;
  for (;;) {
    const o = await paypal.getOrder(order.id);
    if (o.status === "APPROVED") break;
    if (Date.now() > deadline) throw new Error(`Order not approved in time (status ${o.status})`);
    await wait(3000);
  }

  console.log("3. Capturing…");
  const captured = await paypal.captureOrder(order.id);
  const capture = captured.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture || capture.status !== "COMPLETED") throw new Error(`Capture status ${capture?.status ?? "missing"}`);
  console.log(`   capture ${capture.id} ${capture.amount.value} ${capture.amount.currency_code}`);

  const fee = Math.round((SHARE * FEE_PERCENT) / 100);
  console.log(`4. Paying out ${paypal.formatAmount(SHARE - fee)} to ${freelancer} (fee ${paypal.formatAmount(fee)})…`);
  const batch = await paypal.createPayout({
    senderBatchId: runId,
    receiverEmail: freelancer,
    amountCents: SHARE - fee,
    currency: CURRENCY,
    note: "Escrow e2e test payout",
  });
  let status = batch.batch_header.batch_status;
  for (let i = 0; i < 20 && (status === "PENDING" || status === "PROCESSING"); i++) {
    await wait(3000);
    status = (await paypal.getPayoutBatch(batch.batch_header.payout_batch_id)).batch_header.batch_status;
  }
  console.log(`   payout batch ${batch.batch_header.payout_batch_id}: ${status}`);

  console.log(`5. Refunding ${paypal.formatAmount(AMOUNT - SHARE)} to client…`);
  const refund = await paypal.refundCapture(capture.id, AMOUNT - SHARE, CURRENCY, `${runId}-refund`);
  console.log(`   refund ${refund.id}: ${refund.status}`);

  console.log("\n✔ Money flow works end to end. Check balances in the sandbox accounts at sandbox.paypal.com.");
}

main().catch((err) => {
  console.error("\n✘", err.message);
  if (err.details) console.error(JSON.stringify(err.details, null, 2));
  process.exit(1);
});
