import "./setup";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { confirmPlanFunding, settle, startPlanFunding } from "../lib/escrow";
import { approveReplan, replanEffect, reportDropout } from "../lib/replan";
import { getProject, insertProject, newId, updateProject, type Milestone, type Project } from "../lib/store";
import { fakePayPal } from "./helpers";

process.env.PROVIDER_NOOR_EMAIL = "noor@example.com";
process.env.PROVIDER_BEZORGBENDE_EMAIL = "bezorgbende@example.com";
process.env.PROVIDER_FIETSKOERIER_EMAIL = "fietskoerier@example.com";

const goal = { text: "Online lunch orders", budgetCents: 30_000, deadline: null, context: "" };

async function fundedTeamProject() {
  const projectId = newId("p");
  const project: Project = {
    id: projectId, title: "Lunch", clientName: null, freelancerName: null, freelancerEmail: "", currency: "EUR",
    status: "active", approvals: { client: true, freelancer: true }, mode: "team", goal,
    plan: { version: 1, rationale: "v1", leftoverPolicy: "", offers: [], trace: [], history: [], unavailable: [], state: "ready" },
    agreement: "", issues: [], createdAt: new Date().toISOString(), events: [],
  };
  const base = { projectId, currency: "EUR", status: "draft" as const, evidence: "", dueDate: null, events: [], dependsOn: [] };
  const ms: Milestone[] = [
    { ...base, id: newId("m"), title: "Texts", providerId: "noor", amountCents: 3_500, criteria: ["c"] },
    { ...base, id: newId("m"), title: "Order page", providerId: "daan", amountCents: 18_000, criteria: ["c"] },
    { ...base, id: newId("m"), title: "Delivery", providerId: "bezorgbende", amountCents: 7_500, criteria: ["c"] },
  ];
  await insertProject(project, ms);
  fakePayPal();
  const order = await startPlanFunding(projectId);
  await confirmPlanFunding(projectId, order.id);
  // Noor has delivered and been paid: locked in any replan.
  await settle(ms[0].id, 3_500, "verified");
  return { projectId, ms };
}

describe("replanning after a dropout", () => {
  let projectId: string;
  let ms: Milestone[];

  beforeEach(async () => {
    ({ projectId, ms } = await fundedTeamProject());
  });

  it("refuses a dropout for a provider without open work", async () => {
    await assert.rejects(reportDropout(projectId, "noor"), /no open work/);
  });

  it("computes the money effect: refund replaced funded work, fund new work, keep unchanged work", async () => {
    const pending = {
      version: 2, reason: "BezorgBende dropped out", rationale: "", leftoverPolicy: "", changes: [], offers: [],
      milestones: [
        { key: "order", title: "Order page", providerId: "daan", amountCents: 18_000, criteria: ["c"], evidence: "", dependsOn: [] },
        { key: "bike", title: "Bike delivery", providerId: "fietskoerier", amountCents: 5_000, criteria: ["c"], evidence: "", dependsOn: ["order"] },
      ],
      keep: { order: ms[1].id },
    };
    const project = (await getProject(projectId))!;
    const effect = replanEffect(project.milestones, pending);
    assert.deepEqual(effect.replaced.map((m) => m.title), ["Delivery"]);
    assert.equal(effect.refundCents, 7_500);
    assert.equal(effect.newFundingCents, 5_000);
  });

  it("on approval refunds the replaced milestone, keeps the rest and adds the new one unfunded", async () => {
    await updateProject(projectId, (p) => {
      p.plan!.pending = {
        version: 2, reason: "BezorgBende dropped out", rationale: "v2", leftoverPolicy: "", changes: ["Delivery by Fietskoerier"], offers: [],
        milestones: [
          { key: "order", title: "Order page", providerId: "daan", amountCents: 18_000, criteria: ["c"], evidence: "", dependsOn: [] },
          { key: "bike", title: "Bike delivery", providerId: "fietskoerier", amountCents: 5_000, criteria: ["c"], evidence: "", dependsOn: ["order"] },
        ],
        keep: { order: ms[1].id },
      };
    });
    const calls = fakePayPal();
    const p = await approveReplan(projectId);

    const byTitle = Object.fromEntries(p.milestones.map((m) => [m.title, m]));
    assert.equal(byTitle["Texts"].status, "released", "delivered work is untouched");
    assert.equal(byTitle["Order page"].status, "funded", "unchanged open work keeps its funding");
    assert.equal(byTitle["Delivery"].status, "refunded");
    assert.equal(byTitle["Delivery"].replacedIn, 2);
    assert.equal(byTitle["Bike delivery"].status, "draft");
    assert.deepEqual(byTitle["Bike delivery"].dependsOn, [ms[1].id], "dependency on a kept milestone resolves to its id");

    const refunds = calls.filter((c) => c.path.endsWith("/refund"));
    assert.equal(refunds.length, 1);
    assert.equal(refunds[0].body.amount.value, "75.00");
    assert.equal(calls.filter((c) => c.path === "/v1/payments/payouts").length, 0);

    assert.equal(p.plan!.version, 2);
    assert.equal(p.plan!.pending, undefined);
    assert.equal(p.plan!.history[0].reason, "BezorgBende dropped out");

    // The new work is funded with a separate payment for just the added milestone.
    const fundCalls = fakePayPal();
    const order = await startPlanFunding(projectId);
    assert.equal(fundCalls.find((c) => c.path === "/v2/checkout/orders")!.body.purchase_units[0].amount.value, "50.00");
    await confirmPlanFunding(projectId, order.id);
    const after = (await getProject(projectId))!;
    assert.equal(after.milestones.find((m) => m.title === "Bike delivery")!.status, "funded");
  });

  it("does not approve when there is no pending plan", async () => {
    await assert.rejects(approveReplan(projectId), /no new plan/);
  });
});
