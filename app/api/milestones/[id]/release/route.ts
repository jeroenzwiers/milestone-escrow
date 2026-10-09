import { handle, type RouteContext } from "@/lib/api";
import { EscrowError, settle } from "@/lib/escrow";
import { getMilestone } from "@/lib/store";

// Body: { shareCents?: number, reason?: string }. Omit shareCents for a full release.
export function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const m = await getMilestone(id);
    if (!m) throw new EscrowError(`Milestone ${id} not found`, 404);
    const share = body.shareCents ?? m.amountCents;
    return settle(id, Number(share), body.reason ?? "Released by client");
  });
}
