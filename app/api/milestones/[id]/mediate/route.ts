import { NextResponse } from "next/server";
import { handle, type RouteContext } from "@/lib/api";
import { proposeSettlement } from "@/lib/mediation";
import { allowAiCall } from "@/lib/ratelimit";

export async function POST(req: Request, { params }: RouteContext) {
  if (!allowAiCall(req)) {
    return NextResponse.json({ error: "Demo limit reached for AI mediation. Try again later." }, { status: 429 });
  }
  return handle(async () => {
    const { id } = await params;
    return proposeSettlement(id);
  });
}
