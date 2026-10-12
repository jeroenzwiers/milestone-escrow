"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, forgetProject, loadTokens, money, myProjectIds, saveToken, sumCents } from "@/lib/client";
import type { ProjectWithMilestones } from "@/lib/store";

export default function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectWithMilestones[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    // Only projects this browser has a link for; there is no global list.
    Promise.all(
      myProjectIds().map(async (id) => {
        const tokens = loadTokens(id);
        try {
          return await api<ProjectWithMilestones>(`/api/projects/${id}`, "GET", undefined, tokens.client ?? Object.values(tokens)[0]);
        } catch {
          forgetProject(id); // link no longer valid (e.g. the demo data was cleared)
          return null;
        }
      }),
    )
      .then((list) => setProjects(list.filter((p): p is ProjectWithMilestones => p !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt))))
      .catch((e) => setError(e.message));
  }, []);

  async function startTeamDemo() {
    setStarting(true);
    setError(null);
    try {
      const { projectId, tokens } = await api<{ projectId: string; tokens: { client: string; providers: Record<string, string> } }>("/api/demo/team", "POST");
      saveToken(projectId, "client", tokens.client);
      for (const [providerId, token] of Object.entries(tokens.providers)) saveToken(projectId, `provider:${providerId}`, token);
      router.push(`/projects/${projectId}`);
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  }

  async function startDemo() {
    setStarting(true);
    setError(null);
    try {
      const { projectId, tokens } = await api<{ projectId: string; tokens: { client: string; freelancer: string } }>("/api/demo/start", "POST");
      saveToken(projectId, "client", tokens.client);
      saveToken(projectId, "freelancer", tokens.freelancer);
      router.push(`/projects/${projectId}`);
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  }

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">Milestone Escrow · sandbox</p>
          <h1>Your projects</h1>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <button className="primary" onClick={startTeamDemo} disabled={starting}>{starting ? "Setting up…" : "Try the team demo"}</button>
          <Link href="/goals/new" className="button">Start from a goal</Link>
          <Link href="/projects/new" className="button">From an agreement</Link>
          <button onClick={startDemo} disabled={starting}>Single-freelancer demo</button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {projects === null && !error && <p className="muted">Loading…</p>}

      {projects?.length === 0 && (
        <section className="card empty">
          <h2>Give it a goal and a budget. A team assembles, and everyone is paid when their part is verified.</h2>
          <p className="muted">
            AI agents ask providers for offers, negotiate within your budget and propose one plan. You fund it with a single PayPal payment; each provider is paid out only after an AI reviewer has checked their delivery against the agreed criteria, and unspent money comes back to you. If a provider drops out, the plan repairs itself.
          </p>
          <p className="small muted">
            <strong>Try the team demo</strong> gives you your own copy of a bakery&apos;s goal with the team the agents assembled for it in an earlier run; approve and fund it, then let a provider drop out and watch the agents replan live. You can act as the client and as every provider in this browser. <strong>Start from a goal</strong> runs the agents on your own goal; <strong>From an agreement</strong> turns a quote into milestones for one freelancer. Providers are demo agents and payments run in the PayPal sandbox.
          </p>
        </section>
      )}

      {projects?.map((p) => {
        const total = sumCents(p.milestones);
        const held = sumCents(p.milestones, (m) => !["draft", "awaiting_funding", "released", "split", "refunded"].includes(m.status));
        const settled = sumCents(p.milestones, (m) => ["released", "split", "refunded"].includes(m.status));
        return (
          <Link key={p.id} href={`/projects/${p.id}`} className="card link-card">
            <div className="card-head">
              <h2>
                {p.title}
                <span className={`badge ${p.status === "active" ? "funded" : "proposed"}`}>
                  {p.plan?.state === "planning" ? "assembling team" : p.status === "active" ? "agreed" : "awaiting approval"}
                </span>
              </h2>
              <span className="amount">{money(total, p.currency)}</span>
            </div>
            <p className="small muted">
              {[p.clientName, p.freelancerName].filter(Boolean).join(" → ") || "Parties not named"} · {p.milestones.length} milestones
              {p.status === "active" && <> · {money(held, p.currency)} held · {money(settled, p.currency)} settled</>}
            </p>
          </Link>
        );
      })}
    </main>
  );
}
