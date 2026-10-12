import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/paypal";
import { handlePayPalEvent } from "@/lib/webhooks";

// Register https://<host>/api/webhooks/paypal in the PayPal developer dashboard
// and put the webhook id in PAYPAL_WEBHOOK_ID.
export async function POST(req: Request) {
  const raw = await req.text();
  try {
    if (!(await verifyWebhookSignature(req.headers, raw))) {
      return NextResponse.json({ error: "invalid signature" }, { status: 400 });
    }
    const result = await handlePayPalEvent(JSON.parse(raw));
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("paypal webhook", err);
    // 500 makes PayPal retry later.
    return NextResponse.json({ error: "webhook processing failed" }, { status: 500 });
  }
}
