import { handle, type RouteContext } from "@/lib/api";
import { EscrowError } from "@/lib/escrow";
import { addStatement } from "@/lib/mediation";

// Body: { role: "client" | "freelancer", text: string }
export function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    const { role, text } = await req.json().catch(() => ({}));
    if (role !== "client" && role !== "freelancer") throw new EscrowError("role must be client or freelancer");
    return addStatement(id, role, String(text ?? ""));
  });
}
