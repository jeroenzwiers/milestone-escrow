// Try team planning from the command line: plan the bakery goal, then let the
// courier drop out and replan. No PayPal, no database.
// Usage: npm run ai:plan
import type { Goal, Milestone } from "../lib/store";
import { runPlanner } from "../lib/team";

const goal: Goal = {
  text: "I want to start online lunch orders for my bakery next week: customers order and pay online, and lunches are delivered in the neighbourhood at lunchtime.",
  budgetCents: 30_000,
  deadline: "next week",
  context: "Existing website (static, GitHub Pages) with our 24 products. Menu: 8 lunch items (sandwiches, soup, salads). Most customers are offices within 2 km.",
};

const euros = (c: number) => `€${(c / 100).toFixed(2)}`;
const print = (title: string, r: Awaited<ReturnType<typeof runPlanner>>) => {
  console.log(`\n=== ${title}`);
  for (const m of r.milestones) console.log(`- [${m.key}] ${m.title} · ${m.providerId} · ${euros(m.amountCents)}${m.dependsOn.length ? ` · after ${m.dependsOn.join(", ")}` : ""}\n    ${m.criteria.join("\n    ")}`);
  console.log(`\nRationale: ${r.rationale}\nLeftover: ${r.leftoverPolicy}`);
  if (r.changes.length) console.log(`Changes:\n  - ${r.changes.join("\n  - ")}`);
};

async function main() {
  const t0 = Date.now();
  const plan = await runPlanner({ goal, unavailable: [], onTrace: async (t) => console.log(`  [${t.tool}] ${t.summary}`) });
  print(`Plan v1 (${((Date.now() - t0) / 1000).toFixed(0)}s)`, plan);

  const courier = plan.milestones.find((m) => getKind(m.providerId) === "delivery");
  if (!courier) return console.log("\n(no delivery provider in plan v1; skipping the dropout scenario)");

  // Pretend the first non-delivery milestone is already delivered and paid.
  const asMilestone = (m: (typeof plan.milestones)[number], status: Milestone["status"]): Milestone => ({
    id: m.key, projectId: "p", providerId: m.providerId, dependsOn: m.dependsOn, title: m.title, criteria: m.criteria,
    evidence: m.evidence, dueDate: null, amountCents: m.amountCents, currency: "EUR", status, events: [],
  });
  const done = plan.milestones.filter((m) => m !== courier).slice(0, 1);
  const open = plan.milestones.filter((m) => !done.includes(m));
  const t1 = Date.now();
  const replan = await runPlanner({
    goal,
    unavailable: [courier.providerId],
    current: { locked: done.map((m) => asMilestone(m, "released")), open: open.map((m) => asMilestone(m, "funded")), dropped: courier.providerId, offers: plan.offers },
    onTrace: async (t) => console.log(`  [${t.tool}] ${t.summary}`),
  });
  print(`Plan v2 after ${courier.providerId} dropped out (${((Date.now() - t1) / 1000).toFixed(0)}s)`, replan);
}

function getKind(id: string) {
  return id === "fietskoerier" || id === "bezorgbende" ? "delivery" : "other";
}

main().catch((err) => {
  console.error("✘", err.message);
  process.exit(1);
});
