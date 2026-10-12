import { authorizeMilestone } from "@/lib/access";
import { handle, type RouteContext } from "@/lib/api";
import { addStatement } from "@/lib/mediation";

// Body: { text: string }. The statement is recorded for the holder of the link.
export function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    const { role } = await authorizeMilestone(req, id);
    const { text } = await req.json().catch(() => ({}));
    return addStatement(id, role, String(text ?? ""));
  });
}
