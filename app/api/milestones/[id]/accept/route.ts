import { handle, type RouteContext } from "@/lib/api";
import { EscrowError } from "@/lib/escrow";
import { acceptProposal } from "@/lib/mediation";

// Body: { role: "client" | "freelancer", proposalAt: string }
export function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    const { role, proposalAt } = await req.json().catch(() => ({}));
    if (role !== "client" && role !== "freelancer") throw new EscrowError("role must be client or freelancer");
    return acceptProposal(id, role, String(proposalAt ?? ""));
  });
}
