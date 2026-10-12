import "./setup";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { approvePlan, editMilestone } from "../lib/projects";
import { resetStore, updateProject } from "../lib/store";

describe("plan approval", () => {
  beforeEach(async () => {
    await resetStore();
    await updateProject("p_bakery", (p) => {
      p.status = "proposed";
      p.approvals = { client: false, freelancer: false };
    });
  });

  it("activates the project only when both parties approved", async () => {
    assert.equal((await approvePlan("p_bakery", "client")).status, "proposed");
    assert.equal((await approvePlan("p_bakery", "freelancer")).status, "active");
  });

  it("resets both approvals when the plan is edited", async () => {
    await approvePlan("p_bakery", "client");
    const p = await editMilestone("p_bakery", "m1", { amountCents: 45000 });
    assert.deepEqual(p.approvals, { client: false, freelancer: false });
  });

  it("freezes the plan once agreed", async () => {
    await approvePlan("p_bakery", "client");
    await approvePlan("p_bakery", "freelancer");
    await assert.rejects(editMilestone("p_bakery", "m1", { amountCents: 1 }), /no longer be changed/);
  });

  it("rejects invalid edits", async () => {
    await assert.rejects(editMilestone("p_bakery", "m1", { amountCents: 0 }), /greater than zero/);
    await assert.rejects(editMilestone("p_bakery", "m1", { criteria: [" ", ""] }), /at least one/);
  });
});
