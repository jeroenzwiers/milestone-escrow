import "./setup";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { confirmFunding, settle, startFunding } from "../lib/escrow";
import { getMilestone, resetStore, updateProject } from "../lib/store";
import { fakePayPal } from "./helpers";

async function fund(id: string) {
  const order = await startFunding(id);
  return confirmFunding(id, order.id);
}

describe("escrow money flow", () => {
  beforeEach(() => resetStore());

  it("funds a milestone by creating and capturing an order", async () => {
    const calls = fakePayPal();
    const m = await fund("m1");
    assert.equal(m.status, "funded");
    assert.ok(m.captureId);
    assert.equal(calls.find((c) => c.path === "/v2/checkout/orders")!.body.purchase_units[0].amount.value, "400.00");
  });

  it("blocks funding before both parties approved the plan", async () => {
    fakePayPal();
    await updateProject("p_bakery", (p) => void (p.status = "proposed"));
    await assert.rejects(startFunding("m1"), /approve the plan/);
  });

  it("releases in full minus the platform fee", async () => {
    const calls = fakePayPal();
    await fund("m1");
    const m = await settle("m1", 40000, "test");
    assert.equal(m.status, "released");
    assert.deepEqual([m.payout!.amountCents, m.payout!.feeCents], [38000, 2000]);
    assert.equal(calls.find((c) => c.path === "/v1/payments/payouts")!.body.items[0].amount.value, "380.00");
    assert.equal(calls.some((c) => c.path.endsWith("/refund")), false);
  });

  it("splits: pays out the freelancer's share and refunds the rest", async () => {
    const calls = fakePayPal();
    await fund("m1");
    const m = await settle("m1", 28000, "70/30");
    assert.equal(m.status, "split");
    assert.deepEqual([m.payout!.amountCents, m.payout!.feeCents, m.refund!.amountCents], [26600, 1400, 12000]);
    assert.equal(calls.find((c) => c.path.endsWith("/refund"))!.body.amount.value, "120.00");
  });

  it("refunds in full without a payout", async () => {
    const calls = fakePayPal();
    await fund("m1");
    const m = await settle("m1", 0, "refund");
    assert.equal(m.status, "refunded");
    assert.equal(calls.some((c) => c.path === "/v1/payments/payouts"), false);
  });

  it("refuses to settle money that isn't held, or to settle twice", async () => {
    fakePayPal();
    await assert.rejects(settle("m1", 40000, "x"), /no funds to settle/);
    await fund("m1");
    await settle("m1", 40000, "x");
    await assert.rejects(settle("m1", 40000, "again"), /no funds to settle/);
  });

  it("rejects shares outside 0..amount", async () => {
    fakePayPal();
    await fund("m1");
    await assert.rejects(settle("m1", 40001, "x"), /between 0 and 40000/);
    await assert.rejects(settle("m1", -1, "x"), /between 0 and 40000/);
    await assert.rejects(settle("m1", 100.5, "x"), /between 0 and 40000/);
  });

  it("retries a half-finished split without paying out twice", async () => {
    let calls = fakePayPal({ failRefund: true });
    await fund("m1");
    await assert.rejects(settle("m1", 28000, "70/30"));
    let m = (await getMilestone("m1"))!;
    assert.equal(m.status, "funded");
    assert.ok(m.payout, "payout recorded before the refund failed");

    calls = fakePayPal();
    m = await settle("m1", 28000, "70/30 retry");
    assert.equal(m.status, "split");
    assert.equal(calls.filter((c) => c.path === "/v1/payments/payouts").length, 0);
    assert.equal(calls.filter((c) => c.path.endsWith("/refund")).length, 1);
  });
});
