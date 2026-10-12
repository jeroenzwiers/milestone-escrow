import { authorizeProject } from "@/lib/access";
import { handle, type RouteContext } from "@/lib/api";
import { startPlanFunding } from "@/lib/escrow";

// Team mode: one PayPal order for every unfunded milestone of the approved plan.
export function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    await authorizeProject(req, id, ["client"]);
    const order = await startPlanFunding(id);
    return { orderId: order.id };
  });
}
