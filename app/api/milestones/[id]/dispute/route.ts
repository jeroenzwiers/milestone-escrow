import { authorizeMilestone } from "@/lib/access";
import { handle, type RouteContext } from "@/lib/api";
import { dispute } from "@/lib/delivery";

// Body: { reason: string }. Who may dispute depends on the caller's role (see lib/delivery.ts).
export function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    const { role } = await authorizeMilestone(req, id);
    const { reason } = await req.json().catch(() => ({}));
    return dispute(id, role, String(reason ?? ""));
  });
}
