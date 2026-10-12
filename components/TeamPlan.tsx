"use client";

import { money } from "@/lib/client";
import type { Milestone, Offer, ProjectWithMilestones, TraceEntry } from "@/lib/store";

export type ProviderInfo = { id: string; name: string; kind: string };

const KIND_ICON: Record<string, string> = { developer: "⌨", content: "✎", delivery: "🚲" };

export function GoalCard({ project }: { project: ProjectWithMilestones }) {
  const g = project.goal!;
  return (
    <section className="card goal">
      <p className="label">Goal</p>
      <p className="goal-text">{g.text}</p>
      <p className="small muted">
        Budget <strong>{money(g.budgetCents, project.currency)}</strong>
        {g.deadline && <> · Deadline <strong>{g.deadline}</strong></>}
        {g.context && <> · {g.context}</>}
      </p>
    </section>
  );
}

const TRACE_CLASS: Record<string, string> = { offer: "t-offer", rejected: "t-rejected", submit_plan: "t-ok", counter_offer: "t-counter", start: "t-start" };

/** The agents at work: requests, offers, counter-offers, rule checks. */
export function NegotiationTrace({ trace, live }: { trace: TraceEntry[]; live: boolean }) {
  return (
    <div className={`negotiation ${live ? "live" : ""}`}>
      {live && (
        <p className="reviewing-head">
          <span className="spinner" /> Assembling a team: asking providers for offers…
        </p>
      )}
      <ol>
        {trace.map((t, i) => (
          <li key={i} className={TRACE_CLASS[t.tool] ?? ""}>{t.summary}</li>
        ))}
      </ol>
    </div>
  );
}

export function BudgetBar({ usedCents, budgetCents, currency }: { usedCents: number; budgetCents: number; currency: string }) {
  const pct = Math.min(100, Math.round((usedCents / budgetCents) * 100));
  return (
    <div className="budget">
      <div className="budget-head">
        <span><strong>{money(usedCents, currency)}</strong> of {money(budgetCents, currency)} budget</span>
        <span className="muted small">{money(Math.max(0, budgetCents - usedCents), currency)} unplanned, returned to you</span>
      </div>
      <div className="bar" aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** The plan the agents assembled: who does what, in which order, and the offers behind it. */
export function TeamPlanView({ project, providers }: { project: ProjectWithMilestones; providers: ProviderInfo[] }) {
  const plan = project.plan!;
  const name = (id: string) => providers.find((p) => p.id === id)?.name ?? id;
  const kind = (id: string) => providers.find((p) => p.id === id)?.kind ?? "";
  const used = project.milestones.reduce((n, m) => n + m.amountCents, 0);
  const team = [...new Set(project.milestones.map((m) => m.providerId!))];
  const titleOf = (id: string) => project.milestones.find((m) => m.id === id)?.title ?? id;

  return (
    <section className="card team-plan">
      <div className="card-head">
        <h2>Proposed team{plan.version > 1 && <span className="badge proposed">plan v{plan.version}</span>}</h2>
      </div>
      <BudgetBar usedCents={used} budgetCents={project.goal!.budgetCents} currency={project.currency} />

      <div className="team-grid">
        {team.map((id) => (
          <div key={id} className="member">
            <span className="kind">{KIND_ICON[kind(id)] ?? "•"}</span>
            <div>
              <strong>{name(id)}</strong>
              <span className="small muted">{kind(id)} · {money(project.milestones.filter((m) => m.providerId === id).reduce((n, m) => n + m.amountCents, 0), project.currency)}</span>
            </div>
          </div>
        ))}
      </div>

      <ol className="plan-steps">
        {project.milestones.map((m: Milestone) => (
          <li key={m.id}>
            <div className="step-head">
              <strong>{m.title}</strong>
              <span>{money(m.amountCents, m.currency)}</span>
            </div>
            <p className="small muted">
              {name(m.providerId!)}
              {m.dependsOn && m.dependsOn.length > 0 && <> · after {m.dependsOn.map(titleOf).join(", ")}</>}
            </p>
            <ul className="small">{m.criteria.map((c) => <li key={c}>{c}</li>)}</ul>
          </li>
        ))}
      </ol>

      <div className="rationale">
        <p className="label">Why this plan</p>
        <p className="small" style={{ whiteSpace: "pre-wrap" }}>{plan.rationale}</p>
        <p className="small muted">{plan.leftoverPolicy}</p>
      </div>

      <details>
        <summary className="muted small">All offers the agents received ({plan.offers.length})</summary>
        <ul className="offers">
          {plan.offers.map((o: Offer, i: number) => (
            <li key={i} className={o.accepted ? "" : "declined"}>
              <strong>{name(o.providerId)}</strong> {o.accepted ? `offered ${money(o.priceCents, project.currency)}` : "declined"} · <span className="muted">{o.scope}</span>
              {o.conditions.length > 0 && <ul>{o.conditions.map((c) => <li key={c}>{c}</li>)}</ul>}
              {o.note && <p className="muted">{o.note}</p>}
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary className="muted small">How the agents negotiated ({plan.trace.length} steps)</summary>
        <NegotiationTrace trace={plan.trace} live={false} />
      </details>
    </section>
  );
}
