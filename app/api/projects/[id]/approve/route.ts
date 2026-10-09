import { handle, type RouteContext } from "@/lib/api";
import { EscrowError } from "@/lib/escrow";
import { approvePlan } from "@/lib/projects";

// Body: { role: "client" | "freelancer" }
export function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    const { role } = await req.json().catch(() => ({}));
    if (role !== "client" && role !== "freelancer") throw new EscrowError("role must be client or freelancer");
    return approvePlan(id, role);
  });
}
