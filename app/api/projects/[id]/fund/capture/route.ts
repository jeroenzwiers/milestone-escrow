import { authorizeProject } from "@/lib/access";
import { handle, type RouteContext } from "@/lib/api";
import { confirmPlanFunding } from "@/lib/escrow";

export function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    await authorizeProject(req, id, ["client"]);
    const { orderId } = await req.json();
    return confirmPlanFunding(id, String(orderId));
  });
}
