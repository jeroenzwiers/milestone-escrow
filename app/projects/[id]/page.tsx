"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuditLog, Criteria, MilestoneCard } from "@/components/MilestoneCard";
import { api, linkFor, loadInvite, loadTokens, money, saveInvite, saveToken, setActiveToken, sumCents, type Invite, type Tokens } from "@/lib/client";
import type { Milestone, ProjectWithMilestones, Role } from "@/lib/store";

type ProjectView = ProjectWithMilestones & { viewerRole: Role };

const rolePrefKey = (id: string) => `escrow:role:${id}`;

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Tokens | null>(null); // null until read from this browser
  const [role, setRole] = useState<Role | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);

  // Arriving via a personal link (?t=…): check it with the server, keep it, and drop it from the URL.
  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href);
      const t = url.searchParams.get("t");
      let fromLink: Role | null = null;
      if (t) {
        url.searchParams.delete("t");
        window.history.replaceState(null, "", url.pathname + url.search);
        try {
          fromLink = (await api<ProjectView>(`/api/projects/${id}`, "GET", undefined, t)).viewerRole;
          saveToken(id, fromLink, t);
        } catch (e) {
          setError((e as Error).message);
        }
      }
      const saved = loadTokens(id);
      let pref: string | null = null;
      try {
        pref = localStorage.getItem(rolePrefKey(id));
      } catch {}
      const preferred = pref === "client" || pref === "freelancer" ? (saved[pref] ? pref : null) : null;
      setTokens(saved);
      setInvite(loadInvite(id));
      setRole(fromLink ?? preferred ?? (saved.client ? "client" : saved.freelancer ? "freelancer" : null));
    })();
  }, [id]);

  const token = role && tokens ? (tokens[role] ?? null) : null;
  // Every API call from this page (and its components) acts as the selected party.
  setActiveToken(token);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setProject(await api<ProjectView>(`/api/projects/${id}`, "GET", undefined, token));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, token]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  function switchRole(r: Role) {
    setRole(r);
    try {
      localStorage.setItem(rolePrefKey(id), r);
    } catch {}
  }

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

  if (tokens && !token) {
    return (
      <main>
        <Link href="/" className="back">← Projects</Link>
        {error && <div className="error">{error}</div>}
        <section className="card">
          <h2>You need your personal link</h2>
          <p className="muted">Each party opens a project with the private link they received when it was created. Ask the person who created the project to send you yours.</p>
        </section>
      </main>
    );
  }

  if (!project || !role) {
    return (
      <main>
        <Link href="/" className="back">← Projects</Link>
        {error ? <div className="error">{error}</div> : <p className="muted">Loading…</p>}
      </main>
    );
  }

  const { currency, milestones } = project;
  const total = sumCents(milestones);
  const heldStatuses: Milestone["status"][] = ["funded", "in_review", "changes_requested", "needs_review", "verified", "disputed"];

  return (
    <main>
      <Link href="/" className="back">← Projects</Link>
      <header>
        <div>
          <p className="eyebrow">{[project.clientName, project.freelancerName].filter(Boolean).join(" → ") || "Project"}</p>
          <h1>{project.title}</h1>
        </div>
        <RoleSwitch role={role} available={tokens ?? {}} onChange={switchRole} />
        <div className="totals">
          <div><span className="muted small">Total</span><strong>{money(total, currency)}</strong></div>
          {project.status === "active" && (
            <>
              <div><span className="muted small">Held in escrow</span><strong>{money(sumCents(milestones, (m) => heldStatuses.includes(m.status)), currency)}</strong></div>
              <div><span className="muted small">Settled</span><strong>{money(sumCents(milestones, (m) => ["released", "split", "refunded"].includes(m.status)), currency)}</strong></div>
            </>
          )}
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      {invite && (
        <InvitePanel
          projectId={id}
          invite={invite}
          onOpenHere={() => {
            saveToken(id, invite.role, invite.token);
            saveInvite(id, null);
            setTokens(loadTokens(id));
            setInvite(null);
          }}
          onDone={() => {
            saveInvite(id, null);
            setInvite(null);
          }}
        />
      )}

      {project.status === "proposed" ? (
        <>
          <ApprovalBar project={project} role={role} busy={busy !== null} onApprove={() => run(`approve-${role}`, () => api(`/api/projects/${id}/approve`, "POST"))} />
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

/** Switch between parties only when this browser holds both links (the demo). */
function RoleSwitch({ role, available, onChange }: { role: Role; available: Tokens; onChange: (r: Role) => void }) {
  const roles = (["client", "freelancer"] as const).filter((r) => available[r]);
  if (roles.length < 2) {
    return (
      <span className="role-badge">
        You are the <strong>{role}</strong>
      </span>
    );
  }
  return (
    <div className="role-switch" role="group" aria-label="Acting as">
      <span className="muted small">Acting as</span>
      {roles.map((r) => (
        <button key={r} className={role === r ? "active" : ""} onClick={() => onChange(r)} aria-pressed={role === r}>
          {r === "client" ? "Client" : "Freelancer"}
        </button>
      ))}
    </div>
  );
}

function InvitePanel({ projectId, invite, onOpenHere, onDone }: { projectId: string; invite: Invite; onOpenHere: () => void; onDone: () => void }) {
  const link = linkFor(projectId, invite.token);
  const [copied, setCopied] = useState(false);
  return (
    <section className="card invite">
      <h2>Send the {invite.role} their personal link</h2>
      <p className="small muted">
        Anyone with this link acts as the {invite.role} on this project, so send it only to them. It is shown here once and is not stored on the server.
      </p>
      <div className="link-row">
        <input type="text" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label={`Link for the ${invite.role}`} />
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            } catch {}
          }}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <div className="actions">
        <button className="primary" onClick={onDone}>
          I have sent it
        </button>
        <button onClick={onOpenHere}>Demo: also act as the {invite.role} in this browser</button>
      </div>
    </section>
  );
}

function ApprovalBar({ project, role, busy, onApprove }: { project: ProjectWithMilestones; role: Role; busy: boolean; onApprove: () => void }) {
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
        {parties.map((p) =>
          project.approvals[p.role] ? (
            <span key={p.role} className="approved">
              ✓ {p.label} approved
            </span>
          ) : p.role === role ? (
            <button key={p.role} className="primary" disabled={busy} onClick={onApprove}>
              Approve as {p.role}
            </button>
          ) : (
            <span key={p.role} className="pending">
              Waiting for the {p.role}
            </span>
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
