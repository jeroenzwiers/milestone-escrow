import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Liveness check for the host (Render). Public, so it works behind the site password; reveals nothing.
export function GET() {
  return NextResponse.json({ ok: true });
}
