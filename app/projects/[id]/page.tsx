"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuditLog, Criteria, MilestoneCard } from "@/components/MilestoneCard";
import { api, money, sumCents } from "@/lib/client";
import type { Milestone, ProjectWithMilestones, Role } from "@/lib/store";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectWithMilestones | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [role, setRole] = useRole();

  const refresh = useCallback(() => api<ProjectWithMilestones>(`/api/projects/${id}`).then(setProject).catch((e) => setError(e.message)), [id]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Follow the AI review and the challenge-window countdown without reloading.
  const live = project?.milestones.some((m) => m.status === "in_review" || m.status === "verified" || m.payout?.status === "PENDING");
  useEffect(() => {
    if (!live) return;
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [live, refresh]);

  async function run(key: string, fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(key);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(null);
      refresh();
    }
  }

  if (!project) {
    return (
      <main>
        <Link href="/" className="back">← Projects</Link>
        {error ? <div className="error">{error}</div> : <p className="muted">Loading…</p>}
      </main>
    );
  }

  const { currency, milestones } = project;
  const total = sumCents(milestones);

  return (
    <main>
      <Link href="/" className="back">← Projects</Link>
      <header>
        <div>
          <p className="eyebrow">{[project.clientName, project.freelancerName].filter(Boolean).join(" → ") || "Project"}</p>
          <h1>{project.title}</h1>
        </div>
        <RoleSwitch role={role} onChange={setRole} />
        <div className="totals">
          <div><span className="muted small">Total</span><strong>{money(total, currency)}</strong></div>
          {project.status === "active" && (
            <>
              <div><span className="muted small">Held in escrow</span><strong>{money(sumCents(milestones, (m) => m.status === "funded"), currency)}</strong></div>
              <div><span className="muted small">Settled</span><strong>{money(sumCents(milestones, (m) => ["released", "split", "refunded"].includes(m.status)), currency)}</strong></div>
            </>
          )}
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      {project.status === "proposed" ? (
        <>
          <ApprovalBar project={project} busy={busy !== null} onApprove={(role) => run(`approve-${role}`, () => api(`/api/projects/${id}/approve`, "POST", { role }))} />
          <Issues project={project} />
          {milestones.map((m, i) => (
            <DraftMilestone key={m.id} m={m} index={i} busy={busy === m.id} onSave={(edit) => run(m.id, () => api(`/api/projects/${id}/milestones/${m.id}`, "PATCH", edit))} />
          ))}
          {project.agreement && (
            <details className="card">
              <summary className="muted small">Original agreement</summary>
              <pre className="agreement">{project.agreement}</pre>
            </details>
          )}
        </>
      ) : (
        milestones.map((m, i) => (
          <MilestoneCard key={m.id} m={m} index={i} role={role} busy={busy === m.id} run={(fn) => run(m.id, fn)} onError={setError} onChanged={refresh} />
        ))
      )}

      <AuditLog events={project.events} />
    </main>
  );
}

// Demo convenience: one browser plays both parties. Remembered per browser.
function useRole(): [Role, (r: Role) => void] {
  const [role, setRole] = useState<Role>("client");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("role");
      if (saved === "client" || saved === "freelancer") setRole(saved);
    } catch {}
  }, []);
  return [
    role,
    (r) => {
      setRole(r);
      try {
        localStorage.setItem("role", r);
      } catch {}
    },
  ];
}

function RoleSwitch({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  return (
    <div className="role-switch" role="group" aria-label="Viewing as">
      <span className="muted small">Viewing as</span>
      {(["client", "freelancer"] as const).map((r) => (
        <button key={r} className={role === r ? "active" : ""} onClick={() => onChange(r)} aria-pressed={role === r}>
          {r === "client" ? "Client" : "Freelancer"}
        </button>
      ))}
    </div>
  );
}

function ApprovalBar({ project, busy, onApprove }: { project: ProjectWithMilestones; busy: boolean; onApprove: (role: Role) => void }) {
  const parties: { role: Role; label: string }[] = [
    { role: "client", label: project.clientName ?? "Client" },
    { role: "freelancer", label: project.freelancerName ?? "Freelancer" },
  ];
  return (
    <section className="card approval">
      <div>
        <h2>Review and approve the plan</h2>
        <p className="small muted">Milestones can be funded once both parties approve this exact version. Any edit resets both approvals.</p>
      </div>
      <div className="parties">
        {parties.map(({ role, label }) =>
          project.approvals[role] ? (
            <span key={role} className="approved">✓ {label} approved</span>
          ) : (
            <button key={role} className="primary" disabled={busy} onClick={() => onApprove(role)}>
              Approve as {role}
            </button>
          ),
        )}
      </div>
    </section>
  );
}

function Issues({ project }: { project: ProjectWithMilestones }) {
  const warnings = project.issues.filter((i) => i.severity === "warning");
  const notes = project.issues.filter((i) => i.severity === "info");
  if (project.issues.length === 0) return null;
  return (
    <section className="card issues">
      <h2>Check before you approve</h2>
      <p className="small muted">The AI flagged gaps in the agreement that could lead to a dispute later.</p>
      <ul>
        {warnings.map((w) => <li key={w.message} className="warning">{w.message}</li>)}
      </ul>
      {notes.length > 0 && (
        <details>
          <summary className="muted small">{notes.length} more notes</summary>
          <ul>
            {notes.map((n) => <li key={n.message}>{n.message}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}

type Edit = { title: string; amountCents: number; criteria: string[]; evidence: string; dueDate: string | null };

function DraftMilestone({ m, index, busy, onSave }: { m: Milestone; index: number; busy: boolean; onSave: (edit: Edit) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(m.title);
  const [amount, setAmount] = useState((m.amountCents / 100).toFixed(2));
  const [criteria, setCriteria] = useState(m.criteria.join("\n"));
  const [evidence, setEvidence] = useState(m.evidence);
  const [dueDate, setDueDate] = useState(m.dueDate ?? "");

  async function save() {
    const saved = await onSave({ title, amountCents: Math.round(Number(amount) * 100), criteria: criteria.split("\n"), evidence, dueDate: dueDate || null });
    if (saved) setEditing(false);
  }

  if (editing) {
    return (
      <section className="card">
        <label>Title</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="row">
          <div>
            <label>Amount ({m.currency})</label>
            <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label>Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <label>Acceptance criteria (one per line)</label>
        <textarea rows={Math.max(4, m.criteria.length + 1)} value={criteria} onChange={(e) => setCriteria(e.target.value)} />
        <label>Evidence the freelancer submits</label>
        <input type="text" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
        <div className="actions">
          <button className="primary" disabled={busy} onClick={save}>Save changes</button>
          <button disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>
          <span className="step">{index + 1}</span>
          {m.title}
        </h2>
        <span className="amount">{money(m.amountCents, m.currency)}</span>
      </div>
      <Criteria m={m} />
      <div className="actions">
        <button onClick={() => setEditing(true)}>Edit</button>
      </div>
    </section>
  );
}
