"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuditLog, Criteria, MilestoneCard } from "@/components/MilestoneCard";
import { PayPalButton } from "@/components/PayPalButton";
import { DropoutControl, GoalCard, NegotiationTrace, ReplanProposal, TeamPlanView, type ProviderInfo } from "@/components/TeamPlan";
import { api, linkFor, loadInvite, loadTokens, money, partyOf, saveInvite, saveToken, setActiveToken, sumCents, type Invite, type Tokens } from "@/lib/client";
import type { Milestone, ProjectWithMilestones, Role } from "@/lib/store";

type ProjectView = ProjectWithMilestones & { viewerRole: Role; viewerProviderId: string | null; providers: ProviderInfo[] };

const partyPrefKey = (id: string) => `escrow:party:${id}`;
const partyKeyOf = (p: ProjectView) => (p.viewerProviderId ? `provider:${p.viewerProviderId}` : p.viewerRole);

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Tokens | null>(null); // null until read from this browser
  const [party, setParty] = useState<string | null>(null); // "client", "freelancer" or "provider:<id>"
  const [invite, setInvite] = useState<Invite | null>(null);

  // Arriving via a personal link (…#t=token): the token sits in the URL fragment, which browsers
  // never send to the server. Check it with the API, keep it, and drop it from the address bar.
  useEffect(() => {
    (async () => {
      const t = new URLSearchParams(window.location.hash.slice(1)).get("t");
      let fromLink: string | null = null;
      if (t) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        try {
          fromLink = partyKeyOf(await api<ProjectView>(`/api/projects/${id}`, "GET", undefined, t));
          saveToken(id, fromLink, t);
        } catch (e) {
          setError((e as Error).message);
        }
      }
      const saved = loadTokens(id);
      let pref: string | null = null;
      try {
        pref = localStorage.getItem(partyPrefKey(id));
      } catch {}
      setTokens(saved);
      setInvite(loadInvite(id));
      setParty(fromLink ?? (pref && saved[pref] ? pref : null) ?? (saved.client ? "client" : (Object.keys(saved)[0] ?? null)));
    })();
  }, [id]);

  const token = party && tokens ? (tokens[party] ?? null) : null;
  const role: Role | null = party ? partyOf(party).role : null;
  const myProviderId = party ? (partyOf(party).providerId ?? null) : null;
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

  function switchParty(key: string) {
    setParty(key);
    try {
      localStorage.setItem(partyPrefKey(id), key);
    } catch {}
  }

  // Follow the agents, the AI review and the challenge-window countdown without reloading.
  const live =
    project?.plan?.state === "planning" ||
    project?.milestones.some((m) => m.status === "in_review" || m.status === "verified" || m.payout?.status === "PENDING");
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
  const isTeam = project.mode === "team";
  const providerName = (pid?: string) => project.providers.find((p) => p.id === pid)?.name ?? pid ?? "";
  const current = milestones.filter((m) => m.replacedIn === undefined);
  const replacedMs = milestones.filter((m) => m.replacedIn !== undefined);
  const unfunded = current.filter((m) => m.status === "draft" || m.status === "awaiting_funding");
  const dropoutCandidates = [...new Set(current.filter((m) => ["draft", "awaiting_funding", "funded"].includes(m.status)).map((m) => m.providerId!).filter(Boolean))];
  // In team mode, only offer the parties that actually have a role in the current plan.
  const inPlan = new Set(milestones.map((m) => m.providerId).filter(Boolean));
  const switchable = Object.keys(tokens ?? {}).filter((k) => !isTeam || k === "client" || inPlan.has(partyOf(k).providerId));

  return (
    <main>
      <Link href="/" className="back">← Projects</Link>
      <header>
        <div>
          <p className="eyebrow">{isTeam ? "Team plan" : [project.clientName, project.freelancerName].filter(Boolean).join(" → ") || "Project"}</p>
          <h1>{project.title}</h1>
        </div>
        <PartySwitch party={party!} available={switchable} label={(k) => (k === "client" ? "Client" : k === "freelancer" ? "Freelancer" : providerName(partyOf(k).providerId))} onChange={switchParty} />
        <div className="totals">
          <div><span className="muted small">{isTeam ? "Planned" : "Total"}</span><strong>{money(total, currency)}</strong></div>
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

      {isTeam && <GoalCard project={project} />}

      {isTeam && project.plan?.state === "planning" && (
        <section className="card">
          <NegotiationTrace trace={project.status === "active" ? project.plan.trace.slice(project.plan.trace.map((t) => t.tool).lastIndexOf("dropout")) : project.plan.trace} live />
        </section>
      )}

      {isTeam && project.plan?.pending && (
        <ReplanProposal
          project={project}
          pending={project.plan.pending}
          providers={project.providers}
          canApprove={role === "client"}
          busy={busy !== null}
          onApprove={() => run("replan", () => api(`/api/projects/${id}/replan/approve`, "POST"))}
        />
      )}

      {isTeam && project.plan?.state === "failed" && (
        <section className="card">
          <div className="notice warn">
            <strong>No plan could be assembled.</strong> {project.plan.error}
          </div>
          <NegotiationTrace trace={project.plan.trace} live={false} />
        </section>
      )}

      {isTeam && project.plan?.state === "ready" && project.status === "proposed" && (
        <>
          <ApprovalBar project={project} role={role} busy={busy !== null} team onApprove={() => run("approve", () => api(`/api/projects/${id}/approve`, "POST"))} />
          <TeamPlanView project={project} providers={project.providers} />
        </>
      )}

      {isTeam && project.status === "active" && unfunded.length > 0 && !project.plan?.pending && project.plan?.state !== "planning" && (
        <section className="card fund-plan">
          <div>
            <h2>Fund the plan</h2>
            <p className="small muted">
              One payment of <strong>{money(sumCents(unfunded), currency)}</strong> into escrow covers every milestone. Each provider is paid only after their delivery is verified; anything not paid out comes back to you.
            </p>
          </div>
          {role === "client" ? <PayPalButton projectId={id} onError={setError} onFunded={refresh} /> : <p className="hint">Waiting for the client to fund the plan.</p>}
        </section>
      )}

      {!isTeam && project.status === "proposed" && (
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
      )}

      {project.status === "active" &&
        (isTeam ? current : milestones).map((m, i) => (
          <MilestoneCard
            key={m.id}
            m={m}
            index={i}
            role={role}
            busy={busy === m.id}
            run={(fn) => run(m.id, fn)}
            onError={setError}
            onChanged={refresh}
            team={isTeam ? { providerName: providerName(m.providerId), isMine: m.providerId === myProviderId, after: (m.dependsOn ?? []).map((d) => milestones.find((x) => x.id === d)?.title ?? d) } : undefined}
          />
        ))}

      {isTeam && project.status === "active" && project.plan?.state !== "planning" && !project.plan?.pending && (
        <DropoutControl providers={project.providers} candidates={dropoutCandidates} asProvider={myProviderId} busy={busy !== null} onDropout={(pid) => run("dropout", () => api(`/api/projects/${id}/dropout`, "POST", { providerId: pid }))} />
      )}

      {replacedMs.length > 0 && (
        <details className="card">
          <summary className="muted small">Replaced in a later plan version ({replacedMs.length})</summary>
          <ul className="small">
            {replacedMs.map((m) => (
              <li key={m.id}>
                {m.title} · {providerName(m.providerId)} · {money(m.amountCents, currency)} · replaced in v{m.replacedIn}
                {m.refund && <> · refunded {money(m.refund.amountCents, currency)}</>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {isTeam && project.status === "active" && project.plan && (
        <details className="card">
          <summary className="muted small">Plan v{project.plan.version}: why this team</summary>
          <p className="small" style={{ whiteSpace: "pre-wrap" }}>{project.plan.rationale}</p>
          <NegotiationTrace trace={project.plan.trace} live={false} />
        </details>
      )}

      <AuditLog events={project.events} />
    </main>
  );
}

/** Switch between parties when this browser holds several links (the demo). */
function PartySwitch({ party, available, label, onChange }: { party: string; available: string[]; label: (key: string) => string; onChange: (key: string) => void }) {
  if (available.length < 2) {
    return (
      <span className="role-badge">
        You are <strong>{label(party)}</strong>
      </span>
    );
  }
  return (
    <div className="role-switch" role="group" aria-label="Acting as">
      <span className="muted small">Acting as</span>
      {available.map((k) => (
        <button key={k} className={party === k ? "active" : ""} onClick={() => onChange(k)} aria-pressed={party === k}>
          {label(k)}
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

function ApprovalBar({ project, role, busy, onApprove, team }: { project: ProjectWithMilestones; role: Role; busy: boolean; onApprove: () => void; team?: boolean }) {
  if (team) {
    return (
      <section className="card approval">
        <div>
          <h2>Approve this team</h2>
          <p className="small muted">The providers already agreed through their agents. Once you approve, you fund the whole plan with one payment.</p>
        </div>
        <div className="parties">
          {role === "client" ? (
            <button className="primary" disabled={busy} onClick={onApprove}>
              Approve plan
            </button>
          ) : (
            <span className="pending">Waiting for the client</span>
          )}
        </div>
      </section>
    );
  }
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
