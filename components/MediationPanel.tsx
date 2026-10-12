"use client";

import { useState } from "react";
import { api, money } from "@/lib/client";
import type { Milestone, Role } from "@/lib/store";

const OTHER: Record<Role, Role> = { client: "freelancer", freelancer: "client" };

/** Disputed milestone: both sides state their case, the AI proposes a split, both accept. */
export function MediationPanel({ m, role, busy, run }: { m: Milestone; role: Role; busy: boolean; run: (fn: () => Promise<unknown>) => Promise<boolean> }) {
  const d = m.dispute!;
  const mine = d.statements[role];
  const theirs = d.statements[OTHER[role]];
  const [text, setText] = useState(mine ?? "");
  const [editing, setEditing] = useState(!mine);
  const p = d.proposal;

  return (
    <div className="mediation">
      <p className="label">Dispute · opened by the {d.raisedBy}</p>

      <div className="statements">
        <div>
          <p className="small"><strong>Client</strong></p>
          <p className="small quote">{d.statements.client ?? <span className="muted">No statement yet.</span>}</p>
        </div>
        <div>
          <p className="small"><strong>Freelancer</strong></p>
          <p className="small quote">{d.statements.freelancer ?? <span className="muted">No statement yet.</span>}</p>
        </div>
      </div>

      {editing ? (
        <div>
          <label htmlFor={`stmt-${m.id}`}>Your side of the story ({role})</label>
          <textarea id={`stmt-${m.id}`} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={role === "client" ? "What is missing or wrong in the delivery?" : "Why do you think the work meets the agreement?"} />
          <div className="actions">
            <button className="primary" disabled={busy || !text.trim()} onClick={async () => (await run(() => api(`/api/milestones/${m.id}/statement`, "POST", { role, text }))) && setEditing(false)}>
              Save statement
            </button>
            {mine && <button onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </div>
      ) : (
        <div className="actions">
          <button disabled={busy} onClick={() => setEditing(true)}>Edit my statement</button>
          {!p && (
            <button className="primary" disabled={busy} onClick={() => run(() => api(`/api/milestones/${m.id}/mediate`, "POST"))}>
              {busy ? "Mediator is weighing both sides…" : theirs ? "Ask the AI mediator for a proposal" : "Ask the AI mediator now"}
            </button>
          )}
        </div>
      )}

      {p && (
        <div className="proposal">
          <p className="verdict-label">AI mediator proposes</p>
          <div className="split">
            <div>
              <strong>{money(p.shareCents, m.currency)}</strong>
              <span className="small muted">to freelancer ({p.freelancerSharePercent}%)</span>
            </div>
            <div>
              <strong>{money(m.amountCents - p.shareCents, m.currency)}</strong>
              <span className="small muted">back to client ({100 - p.freelancerSharePercent}%)</span>
            </div>
          </div>
          <div className="bar" aria-hidden>
            <span style={{ width: `${p.freelancerSharePercent}%` }} />
          </div>
          <p className="small">{p.rationale}</p>
          <details>
            <summary className="muted small">Per criterion</summary>
            <ul className="small">
              {p.considerations.map((c) => (
                <li key={c.criterion}><strong>{c.criterion}</strong>: {c.assessment}</li>
              ))}
            </ul>
          </details>
          <div className="actions">
            {(["client", "freelancer"] as const).map((r) =>
              p.acceptedBy[r] ? (
                <span key={r} className="approved">✓ {r} accepted</span>
              ) : r === role ? (
                <button key={r} className="primary" disabled={busy} onClick={() => run(() => api(`/api/milestones/${m.id}/accept`, "POST", { role, proposalAt: p.at }))}>
                  Accept proposal
                </button>
              ) : (
                <span key={r} className="small muted">Waiting for the {r}</span>
              ),
            )}
          </div>
          <p className="small muted">Not acceptable? Add to your statement and ask for a new proposal. The money moves only when both of you accept the same proposal.</p>
        </div>
      )}
    </div>
  );
}
