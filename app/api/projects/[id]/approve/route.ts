import { authorizeProject } from "@/lib/access";
import { handle, type RouteContext } from "@/lib/api";
import { approvePlan } from "@/lib/projects";

// Records the approval of whoever holds the link.
export function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    const { role } = await authorizeProject(req, id);
    return approvePlan(id, role);
  });
}
