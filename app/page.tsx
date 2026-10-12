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
          <button onClick={startDemo} disabled={starting}>{starting ? "Setting up…" : "Try the demo project"}</button>
          <Link href="/projects/new" className="button">From an agreement</Link>
          <Link href="/goals/new" className="button primary">Start from a goal</Link>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {projects === null && !error && <p className="muted">Loading…</p>}

      {projects?.length === 0 && (
        <section className="card empty">
          <h2>Freelancers get paid when the work is done. Clients only pay for work that&apos;s done.</h2>
          <p className="muted">
            Paste an agreement and the AI turns it into milestones with checkable criteria. The client funds each milestone with PayPal, an AI reviewer checks the delivery, and the money is released automatically when the work meets the agreement.
          </p>
          <p className="small muted">
            <strong>Try the demo project</strong> gives you your own copy of a bakery webshop project, with both the client and the freelancer role in this browser. Payments run in the PayPal sandbox.
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
