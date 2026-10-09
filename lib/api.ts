import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { AiError } from "./ai";
import { EscrowError } from "./escrow";
import { PayPalError } from "./paypal";

export type RouteContext = { params: Promise<{ id: string }> };

export async function handle(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json(await fn());
  } catch (err) {
    console.error(err);
    if (err instanceof EscrowError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof AiError) return NextResponse.json({ error: err.message }, { status: 502 });
    if (err instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "The AI is busy right now. Try again in a minute." }, { status: 503 });
    if (err instanceof Anthropic.APIError) return NextResponse.json({ error: `AI service error (${err.status ?? "network"})` }, { status: 502 });
    if (err instanceof PayPalError) return NextResponse.json({ error: err.message, details: err.details }, { status: 502 });
    return NextResponse.json({ error: (err as Error).message ?? "Internal error" }, { status: 500 });
  }
}
