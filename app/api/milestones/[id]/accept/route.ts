import { authorizeMilestone } from "@/lib/access";
import { handle, type RouteContext } from "@/lib/api";
import { acceptProposal } from "@/lib/mediation";

// Body: { proposalAt: string }. The accepting party is the holder of the link.
export function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    const { role } = await authorizeMilestone(req, id);
    const { proposalAt } = await req.json().catch(() => ({}));
    return acceptProposal(id, role, String(proposalAt ?? ""));
  });
}
