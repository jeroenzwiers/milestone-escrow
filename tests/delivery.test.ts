import "./setup";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { dispute, processDue, requestChanges } from "../lib/delivery";
import { confirmFunding, startFunding } from "../lib/escrow";
import { getMilestone, resetStore, updateMilestone, type Milestone } from "../lib/store";
import { fakePayPal } from "./helpers";

async function fundedWithStatus(status: Milestone["status"], extra: Partial<Milestone> = {}) {
  fakePayPal();
  const order = await startFunding("m1");
  await confirmFunding("m1", order.id);
  return updateMilestone("m1", (m) => Object.assign(m, { status }, extra));
}

describe("delivery lifecycle", () => {
  beforeEach(() => resetStore());

  it("auto-releases a verified milestone once the challenge window has passed", async () => {
    await fundedWithStatus("verified", { releaseAt: new Date(Date.now() - 1000).toISOString() });
    await processDue();
    const m = (await getMilestone("m1"))!;
    assert.equal(m.status, "released");
    assert.equal(m.payout!.amountCents, 38000);
  });

  it("does not release before the window ends", async () => {
    await fundedWithStatus("verified", { releaseAt: new Date(Date.now() + 60_000).toISOString() });
    await processDue();
    assert.equal((await getMilestone("m1"))!.status, "verified");
  });

  it("lets the client object during the window, which stops the release", async () => {
    await fundedWithStatus("verified", { releaseAt: new Date(Date.now() - 1000).toISOString() });
    const m = await dispute("m1", "client", "Not what we agreed");
    assert.equal(m.status, "disputed");
    assert.equal(m.releaseAt, undefined);
    await processDue();
    assert.equal((await getMilestone("m1"))!.status, "disputed");
  });

  it("only lets each party dispute what concerns them", async () => {
    await fundedWithStatus("changes_requested");
    await assert.rejects(dispute("m1", "client", "x"), /client can't open a dispute/);
    assert.equal((await dispute("m1", "freelancer", "The criteria are met")).dispute!.raisedBy, "freelancer");
  });

  it("requires a reason to dispute", async () => {
    await fundedWithStatus("verified");
    await assert.rejects(dispute("m1", "client", "  "), /Explain/);
  });

  it("sends disputed work back to the freelancer and clears the dispute", async () => {
    await fundedWithStatus("verified");
    await dispute("m1", "client", "Missing the about page");
    const m = await requestChanges("m1", "Please add the about page");
    assert.equal(m.status, "changes_requested");
    assert.equal(m.dispute, undefined);
  });
});
