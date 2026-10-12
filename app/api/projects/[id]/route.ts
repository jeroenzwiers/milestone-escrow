import { handle, type RouteContext } from "@/lib/api";
import { processDue } from "@/lib/delivery";
import { EscrowError, refreshPayout } from "@/lib/escrow";
import { getProject } from "@/lib/store";

const PENDING_PAYOUT = new Set(["PENDING", "PROCESSING"]);

export const dynamic = "force-dynamic";

export function GET(_req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    await processDue();
    const project = await getProject(id);
    if (!project) throw new EscrowError("Project not found", 404);
    // Webhooks can't reach a local dev server; poll payouts that are still in flight.
    const pending = project.milestones.filter((m) => m.payout && PENDING_PAYOUT.has(m.payout.status));
    if (pending.length === 0) return project;
    await Promise.all(pending.map((m) => refreshPayout(m.id).catch(() => {})));
    return getProject(id);
  });
}
