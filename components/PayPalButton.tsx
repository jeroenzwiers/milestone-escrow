"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/client";

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
  // The (public) client id comes from the server at runtime; see app/api/paypal-config.
  sdkPromise ??= Promise.all([
    api<{ clientId: string }>("/api/paypal-config"),
    new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SDK_URL;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Could not load the PayPal SDK"));
      document.head.appendChild(s);
    }),
  ])
    .then(([{ clientId }]) => window.paypal!.createInstance({ clientId, components: ["paypal-payments"] }))
    .catch((err) => {
      sdkPromise = null; // allow a retry on the next render
      throw err;
    });
  return sdkPromise;
}

/** PayPal button for one milestone (`/api/milestones/:id/…`) or a whole team plan (`/api/projects/:id/fund…`). */
export function PayPalButton({
  milestoneId,
  projectId,
  onError,
  onFunded,
}: { milestoneId?: string; projectId?: string; onError: (msg: string) => void; onFunded: () => void }) {
  const orderPath = projectId ? `/api/projects/${projectId}/fund` : `/api/milestones/${milestoneId}/order`;
  const capturePath = projectId ? `/api/projects/${projectId}/fund/capture` : `/api/milestones/${milestoneId}/capture`;
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
              await api(capturePath, "POST", { orderId });
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
          session.start({ presentationMode: "auto" }, api<{ orderId: string }>(orderPath, "POST")).catch((e: Error) => onError(e.message));
        });
        slot.current.appendChild(button);
      })
      .catch((e: Error) => onError(e.message));

    return () => {
      cancelled = true;
      button.remove();
    };
  }, [orderPath, capturePath, onError, onFunded]);

  return <div className="paypal-slot actions" ref={slot} />;
}
