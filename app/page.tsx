"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, money, sumCents } from "@/lib/client";
import type { ProjectWithMilestones } from "@/lib/store";

export default function Home() {
  const [projects, setProjects] = useState<ProjectWithMilestones[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<ProjectWithMilestones[]>("/api/projects").then(setProjects).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function reset() {
    setError(null);
    try {
      setProjects(await api<ProjectWithMilestones[]>("/api/demo/reset", "POST"));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">Milestone Escrow · sandbox</p>
          <h1>Projects</h1>
        </div>
        <Link href="/projects/new" className="button primary">
          New project from agreement
        </Link>
      </header>

      {error && <div className="error">{error}</div>}
      {projects === null && !error && <p className="muted">Loading…</p>}

      {projects?.map((p) => {
        const total = sumCents(p.milestones);
        const held = sumCents(p.milestones, (m) => m.status === "funded");
        const settled = sumCents(p.milestones, (m) => ["released", "split", "refunded"].includes(m.status));
        return (
          <Link key={p.id} href={`/projects/${p.id}`} className="card link-card">
            <div className="card-head">
              <h2>
                {p.title}
                <span className={`badge ${p.status === "active" ? "funded" : "proposed"}`}>{p.status === "active" ? "agreed" : "awaiting approval"}</span>
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

      <button onClick={reset}>Reset demo</button>
    </main>
  );
}
