import "./setup";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { authorizeMilestone, issueTeamAccess, TOKEN_HEADER } from "../lib/access";
import { confirmPlanFunding, settle, startPlanFunding } from "../lib/escrow";
import { checkPlan, executionOrder, type PlanProposal } from "../lib/plan";
import { getProject, insertProject, newId, type Milestone, type Offer, type Project } from "../lib/store";
import { fakePayPal } from "./helpers";

process.env.PROVIDER_NOOR_EMAIL = "noor@example.com";

const goal = { text: "Online lunch orders", budgetCents: 30_000, deadline: null, context: "" };
const offer = (providerId: string, priceCents: number, accepted = true): Offer => ({
  providerId, scope: "", accepted, priceCents, conditions: [], deliverable: "", durationDays: 2, note: "",
});
const offers = [offer("daan", 18_000), offer("noor", 6_000), offer("fietskoerier", 5_000)];
const proposal = (overrides: Partial<PlanProposal> = {}): PlanProposal => ({
  rationale: "",
  leftoverPolicy: "",
  milestones: [
    { key: "checkout", title: "Checkout", providerId: "daan", amountCents: 18_000, criteria: ["Pay with PayPal"], evidence: "PR", dependsOn: [] },
    { key: "texts", title: "Texts", providerId: "noor", amountCents: 6_000, criteria: ["24 texts"], evidence: "doc", dependsOn: [] },
    { key: "delivery", title: "Delivery", providerId: "fietskoerier", amountCents: 5_000, criteria: ["Delivery slot"], evidence: "confirmation", dependsOn: ["checkout"] },
  ],
  ...overrides,
});

describe("plan guardrails", () => {
  const ctx = { goal, offers, unavailable: [] as string[] };

  it("accepts a plan within budget that matches the accepted offers", () => {
    assert.deepEqual(checkPlan(proposal(), ctx), []);
  });

  it("rejects a plan over budget", () => {
    const p = proposal();
    p.milestones[0].amountCents = 20_000;
    const out = checkPlan(p, { ...ctx, offers: [offer("daan", 20_000), offer("noor", 6_000), offer("fietskoerier", 5_000)] });
    assert.ok(out.some((x) => x.includes("over the budget")));
  });

  it("rejects booking a provider for a price it didn't accept", () => {
    const p = proposal();
    p.milestones[0].amountCents = 15_000; // the AI tries to squeeze Daan below his offer
    assert.ok(checkPlan(p, ctx).some((x) => x.includes("accepted 180")));
  });

  it("rejects prices below a provider's floor, providers that declined, and unknown providers", () => {
    const p = proposal();
    p.milestones[1].amountCents = 1_000;
    p.milestones.push({ key: "x", title: "X", providerId: "acme", amountCents: 100, criteria: ["c"], evidence: "", dependsOn: [] });
    const out = checkPlan(p, { ...ctx, offers: [offer("daan", 18_000), offer("noor", 1_000), offer("fietskoerier", 5_000, false)] });
    assert.ok(out.some((x) => x.includes("doesn't work for less")));
    assert.ok(out.some((x) => x.includes("Fietskoerier Demodorp has not accepted")));
    assert.ok(out.some((x) => x.includes('unknown provider "acme"')));
  });

  it("rejects providers that dropped out", () => {
    assert.ok(checkPlan(proposal(), { ...ctx, unavailable: ["fietskoerier"] }).some((x) => x.includes("no longer available")));
  });

  it("rejects dependency cycles and unknown dependencies", () => {
    const p = proposal();
    p.milestones[0].dependsOn = ["delivery"];
    p.milestones[1].dependsOn = ["nope"];
    const out = checkPlan(p, ctx);
    assert.ok(out.some((x) => x.includes("cycle")));
    assert.ok(out.some((x) => x.includes('unknown milestone "nope"')));
  });

  it("counts money already locked in finished milestones against the budget", () => {
    assert.ok(checkPlan(proposal(), { ...ctx, lockedCents: 2_000 }).some((x) => x.includes("over the budget")));
  });

  it("orders milestones so dependencies come first", () => {
    const p = proposal();
    p.milestones.reverse();
    assert.deepEqual(executionOrder(p.milestones).map((m) => m.key), ["texts", "checkout", "delivery"]);
  });
});

describe("team funding and payouts", () => {
  let projectId: string;
  let tokens: ReturnType<typeof issueTeamAccess>["tokens"];

  beforeEach(async () => {
    const issued = issueTeamAccess(["daan", "noor"]);
    tokens = issued.tokens;
    projectId = newId("p");
    const project: Project = {
      id: projectId, title: "Lunch orders", clientName: "Sanne", freelancerName: null, freelancerEmail: "", currency: "EUR",
      status: "active", approvals: { client: true, freelancer: true }, access: issued.access, mode: "team", goal,
      plan: { version: 1, rationale: "", leftoverPolicy: "", offers, trace: [], history: [], unavailable: [] },
      agreement: "", issues: [], createdAt: new Date().toISOString(), events: [],
    };
    const base = { projectId, currency: "EUR", status: "draft" as const, evidence: "", dueDate: null, events: [] };
    const ms: Milestone[] = [
      { ...base, id: newId("m"), title: "Checkout", providerId: "daan", amountCents: 18_000, criteria: ["c"], dependsOn: [] },
      { ...base, id: newId("m"), title: "Texts", providerId: "noor", amountCents: 6_000, criteria: ["c"], dependsOn: [] },
    ];
    await insertProject(project, ms);
  });

  it("funds the whole plan with one order and one capture", async () => {
    const calls = fakePayPal();
    const order = await startPlanFunding(projectId);
    assert.equal(calls.find((c) => c.path === "/v2/checkout/orders")!.body.purchase_units[0].amount.value, "240.00");
    const p = await confirmPlanFunding(projectId, order.id);
    assert.ok(p.milestones.every((m) => m.status === "funded"));
    assert.equal(new Set(p.milestones.map((m) => m.captureId)).size, 1);
  });

  it("pays each milestone out to its own provider and refunds unspent shares from the shared capture", async () => {
    const calls = fakePayPal();
    const order = await startPlanFunding(projectId);
    await confirmPlanFunding(projectId, order.id);
    const [checkout, texts] = (await getProject(projectId))!.milestones;

    await settle(checkout.id, 18_000, "verified");
    await settle(texts.id, 3_000, "half delivered");

    const payouts = calls.filter((c) => c.path === "/v1/payments/payouts").map((c) => [c.body.items[0].receiver, c.body.items[0].amount.value]);
    assert.deepEqual(payouts, [["freelancer@example.com", "171.00"], ["noor@example.com", "28.50"]]);
    const refunds = calls.filter((c) => c.path.endsWith("/refund"));
    assert.equal(refunds.length, 1);
    assert.equal(refunds[0].body.amount.value, "30.00");
    assert.ok(refunds[0].path.includes(checkout.captureId!), "refund comes out of the shared plan capture");
  });

  it("lets a provider act only on its own milestones", async () => {
    const [checkout, texts] = (await getProject(projectId))!.milestones;
    const asNoor = new Request("http://localhost/x", { headers: { [TOKEN_HEADER]: tokens.providers.noor } });
    assert.equal((await authorizeMilestone(asNoor, texts.id, ["freelancer"])).providerId, "noor");
    await assert.rejects(authorizeMilestone(asNoor, checkout.id, ["freelancer"]), (e: any) => e.status === 403);
    await assert.rejects(authorizeMilestone(asNoor, texts.id, ["client"]), (e: any) => e.status === 403);
  });
});
