import { handle } from "@/lib/api";
import { editMilestone, type MilestoneEdit } from "@/lib/projects";

type Context = { params: Promise<{ id: string; milestoneId: string }> };

// Body: any of { title, amountCents, criteria, evidence, dueDate }. Only while the plan is proposed.
export function PATCH(req: Request, { params }: Context) {
  return handle(async () => {
    const { id, milestoneId } = await params;
    const body = await req.json().catch(() => ({}));
    const edit: MilestoneEdit = {
      title: typeof body.title === "string" ? body.title : undefined,
      amountCents: body.amountCents === undefined ? undefined : Number(body.amountCents),
      criteria: Array.isArray(body.criteria) ? body.criteria.map(String) : undefined,
      evidence: typeof body.evidence === "string" ? body.evidence : undefined,
      dueDate: body.dueDate === undefined ? undefined : body.dueDate,
    };
    return editMilestone(id, milestoneId, edit);
  });
}
