import { authorizeProject } from "@/lib/access";
import { handle, type RouteContext } from "@/lib/api";
import { approveReplan } from "@/lib/replan";

export function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    await authorizeProject(req, id, ["client"]);
    return approveReplan(id);
  });
}
