import { NextResponse } from "next/server";
import { EscrowError } from "./escrow";
import { PayPalError } from "./paypal";

export type RouteContext = { params: Promise<{ id: string }> };

export async function handle(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json(await fn());
  } catch (err) {
    console.error(err);
    if (err instanceof EscrowError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PayPalError) return NextResponse.json({ error: err.message, details: err.details }, { status: 502 });
    return NextResponse.json({ error: (err as Error).message ?? "Internal error" }, { status: 500 });
  }
}
