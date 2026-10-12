"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, saveInvite, saveToken } from "@/lib/client";
import type { Role } from "@/lib/store";

const EXAMPLE = `Hi Sanne,

Thanks for the call yesterday! As discussed, here's my proposal for the new webshop for De Gouden Korst.

1. Design + product catalogue — a homepage in your warm brown and gold style, with a short story about the bakery, and all 24 products online with a picture, description and price. Has to work well on phones, since most of your customers order from their phone. €400.

2. Checkout — customers pay with PayPal, get a confirmation email, and pick a time slot to collect their order at the shop. €600.

3. Launch — I put the site live and show you how to change products and prices yourself. You'll also get a short manual. €200.

Total €1,200. I can start next Monday; I expect it to take about 4 weeks.

Best,
Daan`;

export default function NewProject() {
  const router = useRouter();
  const [agreement, setAgreement] = useState("");
  const [freelancerEmail, setFreelancerEmail] = useState("");
  const [me, setMe] = useState<Role>("client");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { projectId, tokens } = await api<{ projectId: string; tokens: Record<Role, string> }>("/api/projects", "POST", { agreement, freelancerEmail });
      // Keep only your own link; the other party's link is shown once so you can send it on.
      const other: Role = me === "client" ? "freelancer" : "client";
      saveToken(projectId, me, tokens[me]);
      saveInvite(projectId, { role: other, token: tokens[other] });
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
          <p className="eyebrow">New project</p>
          <h1>Paste your agreement</h1>
          <p className="muted">
            A quote, an email or a chat message. The AI turns it into milestones with acceptance criteria that decide when the money is released.
          </p>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <form className="card" onSubmit={submit}>
        <div className="field-head">
          <label htmlFor="agreement">Agreement</label>
          <button type="button" className="link" onClick={() => setAgreement(EXAMPLE)} disabled={busy}>
            Use example
          </button>
        </div>
        <textarea id="agreement" rows={14} value={agreement} onChange={(e) => setAgreement(e.target.value)} placeholder="Paste the quote, email or proposal here…" disabled={busy} required />

        <label>I am the</label>
        <div className="role-pick">
          {(["client", "freelancer"] as const).map((r) => (
            <label key={r}>
              <input type="radio" name="me" value={r} checked={me === r} onChange={() => setMe(r)} disabled={busy} /> {r === "client" ? "Client (I pay)" : "Freelancer (I deliver)"}
            </label>
          ))}
        </div>

        <label htmlFor="email">Freelancer&apos;s PayPal email</label>
        <input id="email" type="email" value={freelancerEmail} onChange={(e) => setFreelancerEmail(e.target.value)} placeholder="Leave empty to use the sandbox freelancer account" disabled={busy} />

        <div className="actions">
          <button className="primary" type="submit" disabled={busy || agreement.trim().length === 0}>
            {busy ? "Drafting milestones…" : "Draft milestone plan"}
          </button>
          {busy && <span className="muted small">Reading the agreement and writing checkable criteria. This takes about 15 seconds.</span>}
        </div>
      </form>
    </main>
  );
}
