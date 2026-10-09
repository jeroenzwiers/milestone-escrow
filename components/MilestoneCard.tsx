"use client";

import { useState } from "react";
import { api, money } from "@/lib/client";
import type { AuditEvent, Milestone } from "@/lib/store";
import { PayPalButton } from "./PayPalButton";

/** A milestone of an agreed (active) project: fund, then release, split or refund. */
export function MilestoneCard({
  m,
  index,
  busy,
  run,
  onError,
  onFunded,
}: {
  m: Milestone;
  index: number;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => void;
  onError: (msg: string) => void;
  onFunded: () => void;
}) {
  const [sharePct, setSharePct] = useState(70);
  const fundable = m.status === "draft" || m.status === "awaiting_funding";

  return (
    <section className="card">
      <div className="card-head">
        <h2>
          <span className="step">{index + 1}</span>
          {m.title}
          <span className={`badge ${m.status}`}>{m.status.replace("_", " ")}</span>
        </h2>
        <span className="amount">{money(m.amountCents, m.currency)}</span>
      </div>

      <Criteria m={m} />

      {fundable && <PayPalButton milestoneId={m.id} onError={onError} onFunded={onFunded} />}

      {m.status === "funded" && (
        <div className="actions">
          <button className="primary" disabled={busy} onClick={() => run(() => api(`/api/milestones/${m.id}/release`, "POST", {}))}>
            Release payment
          </button>
          <span className="muted small">or split</span>
          <input type="number" min={1} max={99} value={sharePct} onChange={(e) => setSharePct(Number(e.target.value))} />
          <span className="muted small">% to freelancer</span>
          <button
            disabled={busy}
            onClick={() =>
              run(() => api(`/api/milestones/${m.id}/release`, "POST", { shareCents: Math.round((m.amountCents * sharePct) / 100), reason: `Split ${sharePct}/${100 - sharePct}` }))
            }
          >
            Split
          </button>
          <button disabled={busy} onClick={() => run(() => api(`/api/milestones/${m.id}/refund`, "POST", {}))}>
            Refund client
          </button>
        </div>
      )}

      {(m.payout || m.refund) && (
        <p className="small">
          {m.payout && <>Paid out {money(m.payout.amountCents, m.currency)} to freelancer (fee {money(m.payout.feeCents, m.currency)}) · payout {m.payout.status.toLowerCase()}. </>}
          {m.refund && <>Refunded {money(m.refund.amountCents, m.currency)} to client.</>}
        </p>
      )}

      <AuditLog events={m.events} />
    </section>
  );
}

export function Criteria({ m }: { m: Pick<Milestone, "criteria" | "evidence" | "dueDate"> }) {
  return (
    <>
      <p className="label">Acceptance criteria</p>
      <ul className="criteria">
        {m.criteria.map((c) => <li key={c}>{c}</li>)}
      </ul>
      {(m.evidence || m.dueDate) && (
        <p className="small muted">
          {m.evidence && <><strong>Evidence:</strong> {m.evidence}</>}
          {m.evidence && m.dueDate && " · "}
          {m.dueDate && <><strong>Due:</strong> {m.dueDate}</>}
        </p>
      )}
    </>
  );
}

export function AuditLog({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) return null;
  return (
    <details>
      <summary className="muted small">Audit log ({events.length})</summary>
      <ul>
        {events.map((e, i) => (
          <li key={i}>
            {new Date(e.at).toLocaleString()} — {e.type}
            {e.detail && `: ${e.detail}`}
          </li>
        ))}
      </ul>
    </details>
  );
}
