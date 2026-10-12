import { authorizeMilestone } from "@/lib/access";
import { handle, type RouteContext } from "@/lib/api";
import { requestChanges } from "@/lib/delivery";

export function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    await authorizeMilestone(req, id, ["client"]);
    const { feedback } = await req.json().catch(() => ({}));
    return requestChanges(id, String(feedback ?? ""));
  });
}
