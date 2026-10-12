// Shared test setup: an isolated data directory and a fake PayPal API.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** Point the store at a fresh temp directory. Call before importing lib modules. */
export function isolateStore() {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "escrow-test-"));
  process.env.PAYPAL_CLIENT_ID = "test-client";
  process.env.PAYPAL_CLIENT_SECRET = "test-secret";
  process.env.FREELANCER_PAYPAL_EMAIL = "freelancer@example.com";
  process.env.CURRENCY = "EUR";
  process.env.PLATFORM_FEE_PERCENT = "5";
}

export type PayPalCall = { method: string; path: string; body: any };

/** Replace global fetch with a minimal PayPal sandbox double that records calls. */
export function fakePayPal(opts: { failPayout?: boolean; failRefund?: boolean } = {}) {
  const calls: PayPalCall[] = [];
  let n = 0;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init?.body;
    calls.push({ method, path: url.pathname, body });
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

    if (url.pathname === "/v1/oauth2/token") return json(200, { access_token: "tok", expires_in: 3600, scope: "" });
    if (url.pathname === "/v1/payments/payouts" && method === "POST") {
      if (opts.failPayout) return json(422, { name: "INSUFFICIENT_FUNDS", message: "Sender does not have sufficient funds" });
      return json(201, { batch_header: { payout_batch_id: `BATCH${++n}`, batch_status: "PENDING" } });
    }
    if (/^\/v2\/payments\/captures\/[^/]+\/refund$/.test(url.pathname)) {
      if (opts.failRefund) return json(500, { name: "INTERNAL_SERVER_ERROR", message: "boom" });
      return json(201, { id: `REFUND${++n}`, status: "COMPLETED" });
    }
    if (url.pathname === "/v2/checkout/orders" && method === "POST") {
      return json(201, { id: `ORDER${++n}`, status: "CREATED", links: [] });
    }
    const capture = url.pathname.match(/^\/v2\/checkout\/orders\/([^/]+)\/capture$/);
    if (capture) {
      return json(201, {
        id: capture[1],
        status: "COMPLETED",
        links: [],
        purchase_units: [{ payments: { captures: [{ id: `CAPTURE${++n}`, status: "COMPLETED", amount: { currency_code: "EUR", value: "0" } }] } }],
      });
    }
    return json(404, { name: "NOT_FOUND", message: `unexpected ${method} ${url.pathname}` });
  }) as typeof fetch;
  return calls;
}
