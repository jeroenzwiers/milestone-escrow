import { handle, type RouteContext } from "@/lib/api";
import { EscrowError } from "@/lib/escrow";
import { getProject } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET(_req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    const project = await getProject(id);
    if (!project) throw new EscrowError("Project not found", 404);
    return project;
  });
}
