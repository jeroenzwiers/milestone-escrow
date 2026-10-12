"use client";

import { useEffect, useState } from "react";
import { api, money } from "@/lib/client";
import type { AuditEvent, Milestone, Role, Submission } from "@/lib/store";
import { MediationPanel } from "./MediationPanel";
import { PayPalButton } from "./PayPalButton";
import { SubmitWorkForm } from "./SubmitWorkForm";
import { VerificationPanel } from "./VerificationPanel";

const STATUS_LABEL: Record<Milestone["status"], string> = {
  draft: "not funded",
  awaiting_funding: "awaiting payment",
  funded: "funded",
  in_review: "AI reviewing",
  changes_requested: "changes requested",
  needs_review: "needs your decision",
  verified: "verified",
  disputed: "disputed",
  released: "released",
  refunded: "refunded",
  split: "split",
};

const HELD = new Set<Milestone["status"]>(["funded", "changes_requested", "needs_review", "verified", "disputed"]);

/** A milestone of an agreed project: fund, deliver, AI review, then release, split or refund. */
export type TeamInfo = { providerName: string; isMine: boolean; after: string[]; droppedOut?: boolean };

export function MilestoneCard({
  m,
  index,
  role,
  busy,
  run,
  onError,
  onChanged,
  team,
}: {
  m: Milestone;
  index: number;
  role: Role;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<boolean>;
  onError: (msg: string) => void;
  onChanged: () => void;
  /** Team mode: who delivers this milestone, and whether the viewer is that provider. */
  team?: TeamInfo;
}) {
  const latest = m.submissions?.at(-1);
  const fundable = m.status === "draft" || m.status === "awaiting_funding";
  // In team mode a provider only delivers its own milestones; the plan is funded as a whole.
  const canDeliver = role === "freelancer" && (!team || team.isMine);

  return (
    <section className={`card milestone ${m.status}`}>
      <div className="card-head">
        <h2>
          <span className="step">{index + 1}</span>
          {m.title}
          <span className={`badge ${m.status}`}>{STATUS_LABEL[m.status]}</span>
        </h2>
        <span className="amount">{money(m.amountCents, m.currency)}</span>
      </div>
      {team && (
        <p className="provider-line">
          <span className="provider-chip">{team.providerName}</span>
          {team.after.length > 0 && <span className="small muted">after {team.after.join(", ")}</span>}
          {team.isMine && <span className="small mine">your milestone</span>}
        </p>
      )}
      {team?.droppedOut && fundable === false && m.status === "funded" && (
        <div className="notice warn">{team.providerName} dropped out. The money stays in escrow; see the new plan at the top of the page.</div>
      )}

      {latest?.verification && m.status !== "in_review" ? (
        <VerificationPanel verification={latest.verification} />
      ) : (
        <Criteria m={m} />
      )}

      {latest && <SubmissionSummary s={latest} count={m.submissions!.length} />}

      {m.status === "in_review" && latest?.verification && <ReviewInProgress trace={latest.verification.trace} />}

      {fundable &&
        (team ? (
          <p className="hint">Funded together with the rest of the plan.</p>
        ) : role === "client" ? (
          <PayPalButton milestoneId={m.id} onError={onError} onFunded={onChanged} />
        ) : (
          <p className="hint">Waiting for the client to fund this milestone.</p>
        ))}

      {(m.status === "funded" || m.status === "changes_requested") &&
        (canDeliver ? (
          <>
            <SubmitWorkForm milestone={m} onSubmitted={onChanged} />
            {m.status === "changes_requested" && <ContestVerdict m={m} busy={busy} run={run} />}
          </>
        ) : (
          <p className="hint">
            {m.status === "funded" ? `Funds are held in escrow until ${team?.providerName ?? "the freelancer"} delivers.` : `Waiting for ${team?.providerName ?? "the freelancer"} to resubmit.`}
          </p>
        ))}

      {m.status === "verified" && m.releaseAt && <ChallengeWindow m={m} role={role} busy={busy} run={run} />}

      {m.status === "needs_review" && (role === "client" ? <ClientDecision m={m} busy={busy} run={run} /> : <p className="hint">The client is reviewing your delivery.</p>)}

      {m.status === "disputed" && m.dispute && <MediationPanel m={m} role={role} busy={busy} run={run} />}

      {role === "client" && HELD.has(m.status) && m.status !== "needs_review" && <ManualSettlement m={m} busy={busy} run={run} />}

      {(m.payout || m.refund) && (
        <p className="settlement">
          {m.payout && <>Paid out {money(m.payout.amountCents, m.currency)} to freelancer (platform fee {money(m.payout.feeCents, m.currency)}) · payout {m.payout.status.toLowerCase()}. </>}
          {m.refund && <>Refunded {money(m.refund.amountCents, m.currency)} to client.</>}
        </p>
      )}

      <AuditLog events={m.events} />
    </section>
  );
}

function SubmissionSummary({ s, count }: { s: Submission; count: number }) {
  return (
    <details className="submission">
      <summary className="muted small">
        Delivery{count > 1 ? ` #${count}` : ""} · {new Date(s.at).toLocaleString()} · {s.links.length} links · {s.files.length} files
      </summary>
      {s.note && <p className="small quote">{s.note}</p>}
      {s.links.length > 0 && (
        <ul className="small">
          {s.links.map((l) => (
            <li key={l}><a href={l} target="_blank" rel="noreferrer noopener">{l}</a></li>
          ))}
        </ul>
      )}
      {s.files.length > 0 && (
        <div className="thumbs">
          {s.files.map((f) => (
            <a key={f.path} href={f.url} target="_blank" rel="noreferrer">
              {f.mediaType.startsWith("image/") ? <img src={f.url} alt={f.name} /> : <span className="file">{f.name}</span>}
            </a>
          ))}
        </div>
      )}
    </details>
  );
}

function ReviewInProgress({ trace }: { trace: { at: string; tool: string; summary: string }[] }) {
  return (
    <div className="notice reviewing">
      <p className="reviewing-head"><span className="spinner" /> AI reviewer is checking the delivery…</p>
      <ol className="trace">
        {trace.map((t, i) => <li key={i}>{t.summary}</li>)}
      </ol>
    </div>
  );
}

function useCountdown(until: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Date.parse(until) - now);
  return { left, label: `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}` };
}

function ChallengeWindow({ m, role, busy, run }: { m: Milestone; role: Role; busy: boolean; run: (fn: () => Promise<unknown>) => Promise<boolean> }) {
  const { left, label } = useCountdown(m.releaseAt!);
  const [objecting, setObjecting] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="notice ok">
      <p>
        <strong>{left > 0 ? `Payment releases automatically in ${label}` : "Releasing payment…"}</strong>
        <br />
        <span className="small">
          {role === "client" ? "The AI verified every criterion. Object now if something is wrong; otherwise the freelancer is paid." : "The AI verified every criterion. You'll be paid when the client's objection window ends."}
        </span>
      </p>
      {role === "client" && left > 0 && !objecting && (
        <div className="actions">
          <button className="primary" disabled={busy} onClick={() => run(() => api(`/api/milestones/${m.id}/release`, "POST", { reason: "Released early by client after AI verification" }))}>
            Release now
          </button>
          <button disabled={busy} onClick={() => setObjecting(true)}>Object</button>
        </div>
      )}
      {objecting && (
        <div>
          <textarea rows={3} placeholder="What's wrong with the delivery?" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="actions">
            <button className="danger" disabled={busy || !reason.trim()} onClick={() => run(() => api(`/api/milestones/${m.id}/dispute`, "POST", { reason }))}>
              Stop release and object
            </button>
            <button onClick={() => setObjecting(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ContestVerdict({ m, busy, run }: { m: Milestone; busy: boolean; run: (fn: () => Promise<unknown>) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <p className="small muted">
        Disagree with the review? <button className="link" onClick={() => setOpen(true)}>Open a dispute</button>
      </p>
    );
  }
  return (
    <div className="decision">
      <textarea rows={3} placeholder="Why does your delivery meet the agreement?" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="actions">
        <button className="danger" disabled={busy || !reason.trim()} onClick={() => run(() => api(`/api/milestones/${m.id}/dispute`, "POST", { reason }))}>
          Open dispute
        </button>
        <button onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function ClientDecision({ m, busy, run }: { m: Milestone; busy: boolean; run: (fn: () => Promise<unknown>) => Promise<boolean> }) {
  const [feedback, setFeedback] = useState("");
  const [mode, setMode] = useState<"choose" | "changes">("choose");
  return (
    <div className="decision">
      {mode === "choose" ? (
        <div className="actions">
          <button className="primary" disabled={busy} onClick={() => run(() => api(`/api/milestones/${m.id}/release`, "POST", { reason: "Approved by client" }))}>
            Approve and pay
          </button>
          <button disabled={busy} onClick={() => setMode("changes")}>Request changes</button>
          <button disabled={busy} onClick={() => run(() => api(`/api/milestones/${m.id}/refund`, "POST", { reason: "Refunded by client" }))}>
            Refund me
          </button>
        </div>
      ) : (
        <>
          <textarea rows={3} placeholder="What should the freelancer change?" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          <div className="actions">
            <button className="primary" disabled={busy || !feedback.trim()} onClick={async () => (await run(() => api(`/api/milestones/${m.id}/request-changes`, "POST", { feedback }))) && setMode("choose")}>
              Send to freelancer
            </button>
            <button onClick={() => setMode("choose")}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}

function ManualSettlement({ m, busy, run }: { m: Milestone; busy: boolean; run: (fn: () => Promise<unknown>) => Promise<boolean> }) {
  const [sharePct, setSharePct] = useState(70);
  return (
    <details className="manual">
      <summary className="muted small">Settle manually</summary>
      <div className="actions">
        <button disabled={busy} onClick={() => run(() => api(`/api/milestones/${m.id}/release`, "POST", { reason: "Released manually by client" }))}>
          Release in full
        </button>
        <span className="muted small">or split</span>
        <input type="number" min={1} max={99} value={sharePct} onChange={(e) => setSharePct(Number(e.target.value))} />
        <span className="muted small">% to freelancer</span>
        <button
          disabled={busy}
          onClick={() => run(() => api(`/api/milestones/${m.id}/release`, "POST", { shareCents: Math.round((m.amountCents * sharePct) / 100), reason: `Split ${sharePct}/${100 - sharePct}` }))}
        >
          Split
        </button>
        <button disabled={busy} onClick={() => run(() => api(`/api/milestones/${m.id}/refund`, "POST", { reason: "Refunded by client" }))}>
          Refund
        </button>
      </div>
    </details>
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
