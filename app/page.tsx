"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Milestone } from "@/lib/store";

const CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
const SDK_URL = "https://www.sandbox.paypal.com/web-sdk/v6/core";

// Minimal typing for the parts of the PayPal JS SDK v6 we use.
type PayPalSession = { start: (opts: { presentationMode: string }, order: Promise<{ orderId: string }>) => Promise<void> };
type PayPalSdk = {
  createPayPalOneTimePaymentSession: (handlers: {
    onApprove: (data: { orderId: string }) => Promise<void>;
    onCancel?: () => void;
    onError?: (err: Error) => void;
  }) => Promise<PayPalSession>;
};
declare global {
  interface Window {
    paypal?: { createInstance: (opts: { clientId: string; components: string[] }) => Promise<PayPalSdk> };
  }
}

let sdkPromise: Promise<PayPalSdk> | null = null;
function loadPayPal(): Promise<PayPalSdk> {
  if (!CLIENT_ID) return Promise.reject(new Error("NEXT_PUBLIC_PAYPAL_CLIENT_ID is not set"));
  sdkPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the PayPal SDK"));
    document.head.appendChild(s);
  }).then(() => window.paypal!.createInstance({ clientId: CLIENT_ID, components: ["paypal-payments"] }));
  return sdkPromise;
}

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

export default function Home() {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(() => api<Milestone[]>("/api/milestones").then(setMilestones).catch((e) => setError(e.message)), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      refresh();
    }
  }

  const currency = milestones[0]?.currency ?? "USD";
  const sum = (pred: (m: Milestone) => boolean) => milestones.filter(pred).reduce((n, m) => n + m.amountCents, 0);

  return (
    <main>
      <header>
        <div>
          <p className="muted small" style={{ margin: 0 }}>Milestone Escrow · sandbox</p>
          <h1>{milestones[0]?.projectTitle ?? "Loading…"}</h1>
        </div>
        <div className="totals">
          <div><span className="muted small">Held in escrow</span><strong>{money(sum((m) => m.status === "funded"), currency)}</strong></div>
          <div><span className="muted small">Settled</span><strong>{money(sum((m) => ["released", "split", "refunded"].includes(m.status)), currency)}</strong></div>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      {milestones.map((m) => (
        <MilestoneCard key={m.id} m={m} busy={busy === m.id} run={(fn) => run(m.id, fn)} onError={setError} onFunded={refresh} />
      ))}

      <button onClick={() => run("reset", () => api("/api/milestones", "DELETE"))}>Reset demo</button>
    </main>
  );
}

function MilestoneCard({
  m,
  busy,
  run,
  onError,
  onFunded,
}: {
  m: Milestone;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => void;
  onError: (msg: string) => void;
  onFunded: () => void;
}) {
  const [sharePct, setSharePct] = useState(70);
  const fundable = m.status === "draft" || m.status === "awaiting_funding";

  return (
    <section className="card">
      <div className="card-head">
        <h2>
          {m.title}
          <span className={`badge ${m.status}`}>{m.status.replace("_", " ")}</span>
        </h2>
        <span className="amount">{money(m.amountCents, m.currency)}</span>
      </div>

      <ul className="criteria">
        {m.criteria.map((c) => <li key={c}>{c}</li>)}
      </ul>

      {fundable && <PayPalButton milestoneId={m.id} onError={onError} onFunded={onFunded} />}

      {m.status === "funded" && (
        <div className="actions">
          <button className="primary" disabled={busy} onClick={() => run(() => api(`/api/milestones/${m.id}/release`, "POST", {}))}>
            Release payment
          </button>
          <span className="muted small">or split</span>
          <input type="number" min={1} max={99} value={sharePct} onChange={(e) => setSharePct(Number(e.target.value))} />
          <span className="muted small">% to freelancer</span>
          <button
            disabled={busy}
            onClick={() =>
              run(() => api(`/api/milestones/${m.id}/release`, "POST", { shareCents: Math.round((m.amountCents * sharePct) / 100), reason: `Split ${sharePct}/${100 - sharePct}` }))
            }
          >
            Split
          </button>
          <button disabled={busy} onClick={() => run(() => api(`/api/milestones/${m.id}/refund`, "POST", {}))}>
            Refund client
          </button>
        </div>
      )}

      {(m.payout || m.refund) && (
        <p className="small">
          {m.payout && <>Paid out {money(m.payout.amountCents, m.currency)} to freelancer (fee {money(m.payout.feeCents, m.currency)}) · payout {m.payout.status.toLowerCase()}. </>}
          {m.refund && <>Refunded {money(m.refund.amountCents, m.currency)} to client.</>}
        </p>
      )}

      {m.events.length > 0 && (
        <details>
          <summary className="muted small">Audit log ({m.events.length})</summary>
          <ul>
            {m.events.map((e, i) => (
              <li key={i}>
                {new Date(e.at).toLocaleString()} — {e.type}
                {e.detail && `: ${e.detail}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function PayPalButton({ milestoneId, onError, onFunded }: { milestoneId: string; onError: (msg: string) => void; onFunded: () => void }) {
  const slot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const button = document.createElement("paypal-button");
    button.setAttribute("type", "pay");

    loadPayPal()
      .then((sdk) =>
        sdk.createPayPalOneTimePaymentSession({
          onApprove: async ({ orderId }) => {
            try {
              await api(`/api/milestones/${milestoneId}/capture`, "POST", { orderId });
              onFunded();
            } catch (e) {
              onError((e as Error).message);
            }
          },
          onError: (e) => onError(`PayPal: ${e.message}`),
        }),
      )
      .then((session) => {
        if (cancelled || !slot.current) return;
        // The order promise is passed in synchronously so the popup isn't blocked.
        button.addEventListener("click", () => {
          session.start({ presentationMode: "auto" }, api<{ orderId: string }>(`/api/milestones/${milestoneId}/order`, "POST")).catch((e: Error) => onError(e.message));
        });
        slot.current.appendChild(button);
      })
      .catch((e: Error) => onError(e.message));

    return () => {
      cancelled = true;
      button.remove();
    };
  }, [milestoneId, onError, onFunded]);

  return <div className="paypal-slot actions" ref={slot} />;
}
