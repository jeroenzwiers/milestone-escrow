// Minimal PayPal REST client for the money movement the escrow needs:
// Orders (client funds a milestone), Payouts (release to freelancer) and
// Captures refunds (return funds to client). Server-side only.

const API_BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

export class PayPalError extends Error {
  constructor(
    message: string,
    public status: number,
    public details: unknown,
  ) {
    super(message);
  }
}

let cachedToken: { value: string; expiresAt: number; scopes: string[] } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set (see .env.example)");

  const res = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = await res.json();
  if (!res.ok) throw new PayPalError("PayPal authentication failed", res.status, body);

  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000, scopes: String(body.scope ?? "").split(" ") };
  return cachedToken.value;
}

/** Scopes granted to the REST app, e.g. to verify Payouts is enabled. */
export async function grantedScopes(): Promise<string[]> {
  await getAccessToken();
  return cachedToken!.scopes;
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  // Makes POSTs safe to retry: PayPal returns the original result for a repeated id.
  requestId?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await getAccessToken()}`,
    "Content-Type": "application/json",
  };
  if (requestId) headers["PayPal-Request-Id"] = requestId;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const debugId = res.headers.get("paypal-debug-id");
    throw new PayPalError(
      `PayPal ${method} ${path} failed (${res.status})${debugId ? ` debug_id=${debugId}` : ""}: ${json.message ?? json.name ?? text}`,
      res.status,
      json,
    );
  }
  return json as T;
}

export type Money = { currency_code: string; value: string };

type Link = { href: string; rel: string; method?: string };

export type Order = {
  id: string;
  status: "CREATED" | "SAVED" | "APPROVED" | "VOIDED" | "COMPLETED" | "PAYER_ACTION_REQUIRED";
  links: Link[];
  purchase_units?: {
    reference_id?: string;
    payments?: { captures?: { id: string; status: string; amount: Money }[] };
  }[];
};

export type Refund = { id: string; status: string; amount?: Money };

export type PayoutBatch = {
  batch_header: {
    payout_batch_id: string;
    batch_status: "DENIED" | "PENDING" | "PROCESSING" | "SUCCESS" | "CANCELED";
  };
  items?: { payout_item_id: string; transaction_status: string; errors?: unknown }[];
};

export function formatAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function createOrder(opts: {
  referenceId: string;
  description: string;
  amountCents: number;
  currency: string;
  returnUrl?: string;
  cancelUrl?: string;
}) {
  return request<Order>(
    "POST",
    "/v2/checkout/orders",
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: opts.referenceId,
          custom_id: opts.referenceId,
          description: opts.description.slice(0, 127),
          amount: { currency_code: opts.currency, value: formatAmount(opts.amountCents) },
        },
      ],
      ...(opts.returnUrl && {
        payment_source: {
          paypal: {
            experience_context: {
              user_action: "PAY_NOW",
              shipping_preference: "NO_SHIPPING",
              return_url: opts.returnUrl,
              cancel_url: opts.cancelUrl ?? opts.returnUrl,
            },
          },
        },
      }),
    },
    `order-${opts.referenceId}-${Date.now()}`,
  );
}

export function getOrder(orderId: string) {
  return request<Order>("GET", `/v2/checkout/orders/${orderId}`);
}

export function captureOrder(orderId: string) {
  return request<Order>("POST", `/v2/checkout/orders/${orderId}/capture`, undefined, `capture-${orderId}`);
}

export function approveLink(order: Order): string | undefined {
  return order.links.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
}

export function refundCapture(captureId: string, amountCents: number, currency: string, idempotencyKey: string) {
  return request<Refund>(
    "POST",
    `/v2/payments/captures/${captureId}/refund`,
    { amount: { currency_code: currency, value: formatAmount(amountCents) } },
    idempotencyKey,
  );
}

export function createPayout(opts: {
  senderBatchId: string;
  receiverEmail: string;
  amountCents: number;
  currency: string;
  note: string;
}) {
  return request<PayoutBatch>(
    "POST",
    "/v1/payments/payouts",
    {
      sender_batch_header: {
        sender_batch_id: opts.senderBatchId,
        email_subject: "You've been paid for a milestone",
        email_message: opts.note,
      },
      items: [
        {
          recipient_type: "EMAIL",
          receiver: opts.receiverEmail,
          amount: { currency: opts.currency, value: formatAmount(opts.amountCents) },
          note: opts.note,
          sender_item_id: opts.senderBatchId,
        },
      ],
    },
    opts.senderBatchId,
  );
}

export function getPayoutBatch(batchId: string) {
  return request<PayoutBatch>("GET", `/v1/payments/payouts/${batchId}`);
}
