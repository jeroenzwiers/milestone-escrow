"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, saveToken } from "@/lib/client";

const EXAMPLE = {
  goal: "I want to start online lunch orders for my bakery next week: customers order and pay online, and lunches are delivered in the neighbourhood at lunchtime.",
  budget: "300",
  deadline: "next week",
  context: "Existing website (static, GitHub Pages) with our 24 products. Menu: 8 lunch items (sandwiches, soup, salads). Most customers are offices within 2 km.",
};

export default function NewGoal() {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { projectId, tokens } = await api<{ projectId: string; tokens: { client: string; providers: Record<string, string> } }>("/api/teams", "POST", { goal, budget, deadline, context });
      saveToken(projectId, "client", tokens.client);
      // Demo: this browser can also act as each provider. In a real deployment each provider receives their own link.
      for (const [providerId, token] of Object.entries(tokens.providers)) saveToken(projectId, `provider:${providerId}`, token);
      router.push(`/projects/${projectId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main>
      <Link href="/" className="back">← Projects</Link>
      <header>
        <div>
          <p className="eyebrow">Start from a goal</p>
          <h1>What do you want to make happen?</h1>
          <p className="muted">
            Describe the outcome, your budget and when you need it. Agents ask available providers for offers and assemble a team and a plan you can approve. Each provider is paid from escrow only after their delivery is verified.
          </p>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <form className="card" onSubmit={submit}>
        <div className="field-head">
          <label htmlFor="goal">Goal</label>
          <button
            type="button"
            className="link"
            disabled={busy}
            onClick={() => {
              setGoal(EXAMPLE.goal);
              setBudget(EXAMPLE.budget);
              setDeadline(EXAMPLE.deadline);
              setContext(EXAMPLE.context);
            }}
          >
            Use example
          </button>
        </div>
        <textarea id="goal" rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Start online lunch orders with delivery next week" disabled={busy} required />

        <div className="row">
          <div>
            <label htmlFor="budget">Budget (EUR)</label>
            <input id="budget" type="number" min="10" max="10000" step="1" value={budget} onChange={(e) => setBudget(e.target.value)} disabled={busy} required />
          </div>
          <div>
            <label htmlFor="deadline">Deadline</label>
            <input id="deadline" type="text" value={deadline} onChange={(e) => setDeadline(e.target.value)} placeholder="e.g. next week" disabled={busy} />
          </div>
        </div>

        <label htmlFor="context">What you already have (optional)</label>
        <textarea id="context" rows={3} value={context} onChange={(e) => setContext(e.target.value)} placeholder="Website, menu, customers, constraints…" disabled={busy} />

        <div className="actions">
          <button className="primary" type="submit" disabled={busy || !goal.trim() || !budget}>
            {busy ? "Starting…" : "Assemble a team"}
          </button>
          <span className="small muted">Providers in this demo are AI agents with their own private terms. Payments run in the PayPal sandbox.</span>
        </div>
      </form>
    </main>
  );
}
