import { authorizeMilestone } from "@/lib/access";
import { handle, type RouteContext } from "@/lib/api";
import { startFunding } from "@/lib/escrow";

// Called by the JS SDK v6 button: returns the order id the SDK should open.
export function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    await authorizeMilestone(req, id, ["client"]);
    const order = await startFunding(id);
    return { orderId: order.id };
  });
}
