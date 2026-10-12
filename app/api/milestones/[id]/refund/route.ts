import { authorizeMilestone } from "@/lib/access";
import { handle, type RouteContext } from "@/lib/api";
import { settle } from "@/lib/escrow";

export function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    await authorizeMilestone(req, id, ["client"]);
    const body = await req.json().catch(() => ({}));
    return settle(id, 0, body.reason ?? "Refunded to client");
  });
}
