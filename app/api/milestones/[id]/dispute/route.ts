import { handle, type RouteContext } from "@/lib/api";
import { dispute } from "@/lib/delivery";
import { EscrowError } from "@/lib/escrow";

// Body: { role: "client" | "freelancer", reason: string }
export function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    const { role, reason } = await req.json().catch(() => ({}));
    if (role !== "client" && role !== "freelancer") throw new EscrowError("role must be client or freelancer");
    return dispute(id, role, String(reason ?? ""));
  });
}
