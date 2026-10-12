import { NextResponse } from "next/server";
import { authorizeMilestone } from "@/lib/access";
import { handle, type RouteContext } from "@/lib/api";
import { proposeSettlement } from "@/lib/mediation";
import { allowAiCall } from "@/lib/ratelimit";

export function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    await authorizeMilestone(req, id);
    if (!allowAiCall(req)) return NextResponse.json({ error: "Demo limit reached for AI mediation. Try again later." }, { status: 429 });
    return proposeSettlement(id);
  });
}
