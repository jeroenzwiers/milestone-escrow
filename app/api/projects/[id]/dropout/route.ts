import { NextResponse } from "next/server";
import { authorizeProject } from "@/lib/access";
import { handle, type RouteContext } from "@/lib/api";
import { EscrowError } from "@/lib/escrow";
import { allowPlanning } from "@/lib/ratelimit";
import { reportDropout } from "@/lib/replan";

// Body: { providerId }. A provider can withdraw itself; in the demo the client can simulate a dropout.
export async function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    const { role, providerId: caller } = await authorizeProject(req, id);
    const { providerId } = await req.json().catch(() => ({}));
    const target = caller ?? String(providerId ?? "");
    if (role !== "client" && caller !== target) throw new EscrowError("A provider can only withdraw itself", 403);
    if (!allowPlanning(req)) return NextResponse.json({ error: "Demo limit reached for replanning. Try again later." }, { status: 429 });
    await reportDropout(id, target);
    return { ok: true };
  });
}
