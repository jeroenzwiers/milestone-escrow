"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/client";

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

export function PayPalButton({ milestoneId, onError, onFunded }: { milestoneId: string; onError: (msg: string) => void; onFunded: () => void }) {
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
