import { authorizeProject } from "@/lib/access";
import { handle, type RouteContext } from "@/lib/api";
import { processDue } from "@/lib/delivery";
import { refreshPayout } from "@/lib/escrow";
import { withFileUrls } from "@/lib/files";
import { getProject } from "@/lib/store";

export const dynamic = "force-dynamic";

const PENDING_PAYOUT = new Set(["PENDING", "PROCESSING"]);

// Returns the project plus the caller's role, as derived from their link.
export function GET(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    const { role } = await authorizeProject(req, id);
    await processDue();
    let project = (await getProject(id))!;
    // Webhooks can't reach a local dev server; poll payouts that are still in flight.
    const pending = project.milestones.filter((m) => m.payout && PENDING_PAYOUT.has(m.payout.status));
    if (pending.length > 0) {
      await Promise.all(pending.map((m) => refreshPayout(m.id).catch(() => {})));
      project = (await getProject(id))!;
    }
    const { access: _hashes, ...visible } = project;
    return { ...visible, milestones: withFileUrls(visible.milestones), viewerRole: role };
  });
}
