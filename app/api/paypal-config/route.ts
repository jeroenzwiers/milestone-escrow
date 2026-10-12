import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// The PayPal client id is public by design. Serving it at runtime (instead of baking a
// NEXT_PUBLIC_ variable into the bundle at build time) means a deployment can't end up
// with an empty id because the variable was missing during the build.
export function GET() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "PAYPAL_CLIENT_ID is not set" }, { status: 500 });
  return NextResponse.json({ clientId }, { headers: { "Cache-Control": "public, max-age=300" } });
}
