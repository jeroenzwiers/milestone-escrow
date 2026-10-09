// Project lifecycle before money moves: AI drafts a plan from the agreement,
// either party may edit it, and both must approve the same version.
import { extractMilestonePlan } from "./ai";
import { EscrowError } from "./escrow";
import {
  getProject,
  insertProject,
  logEvent,
  newId,
  updateProject,
  type Milestone,
  type Project,
  type Role,
} from "./store";

const MAX_AGREEMENT_CHARS = 20_000;

export async function createProjectFromAgreement(input: { agreement: string; freelancerEmail?: string }) {
  const agreement = input.agreement.trim();
  if (agreement.length < 40) throw new EscrowError("Paste the agreement, quote or email (at least a few sentences).");
  if (agreement.length > MAX_AGREEMENT_CHARS) throw new EscrowError(`Agreement is too long (max ${MAX_AGREEMENT_CHARS} characters).`);

  const freelancerEmail = input.freelancerEmail?.trim() || process.env.FREELANCER_PAYPAL_EMAIL || "";
  const plan = await extractMilestonePlan(agreement, process.env.CURRENCY ?? "EUR");
  if (plan.milestones.length === 0) throw new EscrowError("No milestones found in this agreement.");

  const now = new Date().toISOString();
  const project: Project = {
    id: newId("p"),
    title: plan.projectTitle,
    clientName: plan.clientName,
    freelancerName: plan.freelancerName,
    freelancerEmail,
    currency: plan.currency.toUpperCase(),
    status: "proposed",
    approvals: { client: false, freelancer: false },
    agreement,
    issues: plan.issues,
    createdAt: now,
    events: [],
  };
  logEvent(project, "plan_drafted", `AI drafted ${plan.milestones.length} milestones`);

  const milestones: Milestone[] = plan.milestones.map((m) => ({
    id: newId("m"),
    projectId: project.id,
    title: m.title,
    criteria: m.acceptanceCriteria,
    evidence: m.evidence,
    dueDate: m.dueDate,
    amountCents: Math.round(m.amount * 100),
    currency: project.currency,
    status: "draft",
    events: [],
  }));

  await insertProject(project, milestones);
  return { ...project, milestones };
}

export type MilestoneEdit = { title?: string; amountCents?: number; criteria?: string[]; evidence?: string; dueDate?: string | null };

/** Edit a milestone while the plan is still proposed. Any change resets both approvals. */
export async function editMilestone(projectId: string, milestoneId: string, edit: MilestoneEdit) {
  const project = await getProject(projectId);
  if (!project) throw new EscrowError("Project not found", 404);
  if (project.status !== "proposed") throw new EscrowError("The plan is already agreed and can no longer be changed.");

  if (edit.amountCents !== undefined && (!Number.isInteger(edit.amountCents) || edit.amountCents <= 0)) {
    throw new EscrowError("Amount must be greater than zero.");
  }
  const criteria = edit.criteria?.map((c) => c.trim()).filter(Boolean);
  if (criteria && criteria.length === 0) throw new EscrowError("A milestone needs at least one acceptance criterion.");

  return updateProject(projectId, (p, milestones) => {
    const m = milestones.find((x) => x.id === milestoneId);
    if (!m) throw new EscrowError("Milestone not found", 404);
    if (edit.title !== undefined) m.title = edit.title.trim() || m.title;
    if (edit.amountCents !== undefined) m.amountCents = edit.amountCents;
    if (criteria) m.criteria = criteria;
    if (edit.evidence !== undefined) m.evidence = edit.evidence.trim();
    if (edit.dueDate !== undefined) m.dueDate = edit.dueDate || null;
    p.approvals = { client: false, freelancer: false };
    logEvent(p, "plan_edited", m.title);
  });
}

/** Record one party's approval; the project becomes active once both approved. */
export async function approvePlan(projectId: string, role: Role) {
  const project = await getProject(projectId);
  if (!project) throw new EscrowError("Project not found", 404);
  if (project.status !== "proposed") return project;
  if (role === "freelancer" && !project.freelancerEmail) {
    throw new EscrowError("Add the freelancer's PayPal email before approving.");
  }

  return updateProject(projectId, (p) => {
    p.approvals[role] = true;
    logEvent(p, "plan_approved", role);
    if (p.approvals.client && p.approvals.freelancer) {
      p.status = "active";
      logEvent(p, "plan_agreed", "Both parties approved; milestones can be funded");
    }
  });
}
