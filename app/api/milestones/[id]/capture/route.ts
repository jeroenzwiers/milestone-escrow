import { authorizeMilestone } from "@/lib/access";
import { handle, type RouteContext } from "@/lib/api";
import { confirmFunding } from "@/lib/escrow";

export function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    await authorizeMilestone(req, id, ["client"]);
    const { orderId } = await req.json();
    return confirmFunding(id, String(orderId));
  });
}
