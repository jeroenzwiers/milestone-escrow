import "./setup";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { getMilestone, resetStore, updateMilestone } from "../lib/store";
import { handlePayPalEvent } from "../lib/webhooks";

const event = (id: string, status: string) => ({
  id,
  event_type: `PAYMENT.PAYOUTS-ITEM.${status}`,
  resource: { payout_batch_id: "BATCH1", transaction_status: status },
});

describe("PayPal webhooks", () => {
  beforeEach(async () => {
    await resetStore();
    await updateMilestone("m1", (m) => void (m.payout = { batchId: "BATCH1", amountCents: 38000, feeCents: 2000, status: "PENDING" }));
  });

  it("updates the payout status", async () => {
    assert.equal(await handlePayPalEvent(event("WH-1", "SUCCESS")), "payout SUCCESS");
    assert.equal((await getMilestone("m1"))!.payout!.status, "SUCCESS");
  });

  it("ignores a redelivered event", async () => {
    await handlePayPalEvent(event("WH-2", "SUCCESS"));
    assert.equal(await handlePayPalEvent(event("WH-2", "SUCCESS")), "duplicate");
  });

  it("processes PayPal's retry after a failed first attempt", async () => {
    let first = true;
    const flaky = {
      id: "WH-3",
      event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
      get resource() {
        if (first) {
          first = false;
          throw new Error("store unavailable");
        }
        return { payout_batch_id: "BATCH1", transaction_status: "SUCCESS" };
      },
    };
    await assert.rejects(handlePayPalEvent(flaky));
    assert.equal(await handlePayPalEvent(flaky), "payout SUCCESS");
    assert.equal((await getMilestone("m1"))!.payout!.status, "SUCCESS");
  });
});
