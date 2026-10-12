// Guardrails for team plans. The planner agent proposes; these rules decide whether a
// proposal may be shown to the client at all. Pure functions, so they're easy to test.
import { getProvider } from "./providers";
import type { Goal, Offer } from "./store";

export type PlannedMilestone = {
  key: string; // planner's own id, used for dependencies
  title: string;
  providerId: string;
  amountCents: number;
  criteria: string[];
  evidence: string;
  dependsOn: string[];
};

export type PlanProposal = {
  milestones: PlannedMilestone[];
  rationale: string;
  leftoverPolicy: string;
};

/** Every rule a proposal breaks; an empty list means it may be presented to the client. */
export function checkPlan(
  proposal: PlanProposal,
  ctx: { goal: Goal; offers: Offer[]; unavailable: string[]; lockedCents?: number },
): string[] {
  const problems: string[] = [];
  const ms = proposal.milestones;
  if (ms.length === 0) problems.push("The plan has no milestones.");

  const keys = new Set<string>();
  for (const m of ms) {
    if (keys.has(m.key)) problems.push(`Duplicate milestone key "${m.key}".`);
    keys.add(m.key);
  }

  for (const m of ms) {
    const provider = getProvider(m.providerId);
    if (!provider) {
      problems.push(`"${m.title}": unknown provider "${m.providerId}".`);
      continue;
    }
    if (ctx.unavailable.includes(m.providerId)) problems.push(`"${m.title}": ${provider.name} is no longer available.`);
    if (!Number.isInteger(m.amountCents) || m.amountCents <= 0) problems.push(`"${m.title}": amount must be a positive number of cents.`);
    if (m.amountCents < provider.floorCents) problems.push(`"${m.title}": ${provider.name} doesn't work for less than ${provider.floorCents / 100}.`);
    if (m.criteria.filter((c) => c.trim()).length === 0) problems.push(`"${m.title}": needs at least one acceptance criterion.`);
    for (const d of m.dependsOn) if (!keys.has(d)) problems.push(`"${m.title}": depends on unknown milestone "${d}".`);
  }

  // A provider can only be booked for what it agreed to: the total per provider must equal its accepted offer(s).
  const perProvider = new Map<string, number>();
  for (const m of ms) perProvider.set(m.providerId, (perProvider.get(m.providerId) ?? 0) + m.amountCents);
  for (const [providerId, total] of perProvider) {
    const accepted = ctx.offers.filter((o) => o.providerId === providerId && o.accepted);
    const name = getProvider(providerId)?.name ?? providerId;
    if (accepted.length === 0) {
      problems.push(`${name} has not accepted any offer.`);
      continue;
    }
    // The most recent accepted offer is binding (a counter-offer replaces the first one).
    const binding = accepted[accepted.length - 1];
    if (binding.priceCents !== total) problems.push(`${name} is planned for ${total / 100} but accepted ${binding.priceCents / 100}.`);
  }

  const total = ms.reduce((n, m) => n + m.amountCents, 0) + (ctx.lockedCents ?? 0);
  if (total > ctx.goal.budgetCents) problems.push(`The plan costs ${total / 100}, over the budget of ${ctx.goal.budgetCents / 100}.`);

  if (hasCycle(ms)) problems.push("The dependencies form a cycle.");
  return problems;
}

function hasCycle(ms: PlannedMilestone[]): boolean {
  const deps = new Map(ms.map((m) => [m.key, m.dependsOn]));
  const state = new Map<string, "visiting" | "done">();
  const visit = (k: string): boolean => {
    if (state.get(k) === "done") return false;
    if (state.get(k) === "visiting") return true;
    state.set(k, "visiting");
    for (const d of deps.get(k) ?? []) if (deps.has(d) && visit(d)) return true;
    state.set(k, "done");
    return false;
  };
  return ms.some((m) => visit(m.key));
}

/** Milestones in an order that respects dependencies (stable for independent ones). */
export function executionOrder<T extends { key: string; dependsOn: string[] }>(ms: T[]): T[] {
  const out: T[] = [];
  const placed = new Set<string>();
  while (out.length < ms.length) {
    const next = ms.find((m) => !placed.has(m.key) && m.dependsOn.every((d) => placed.has(d)));
    if (!next) return [...out, ...ms.filter((m) => !placed.has(m.key))]; // cycle: checkPlan reports it
    out.push(next);
    placed.add(next.key);
  }
  return out;
}
