// Team mode: a provider drops out, the planner proposes a new plan version, and only
// after the client approves it does money move: replaced milestones that were already
// funded are refunded, unchanged ones stay as they are, new ones are funded separately.
import { EscrowError, settle } from "./escrow";
import { getProvider } from "./providers";
import { getProject, logEvent, newId, replaceProjectMilestones, updateProject, type Milestone, type PendingPlan } from "./store";
import { runPlanner } from "./team";

// Milestones whose work hasn't started; everything else is locked in a replan.
const OPEN: ReadonlySet<Milestone["status"]> = new Set(["draft", "awaiting_funding", "funded"]);
const isActive = (m: Milestone) => m.replacedIn === undefined;

export function openMilestones(ms: Milestone[]) {
  return ms.filter((m) => isActive(m) && OPEN.has(m.status));
}

/** A provider withdraws (or, in the demo, the client simulates it). Starts replanning. */
export async function reportDropout(projectId: string, providerId: string) {
  const project = await getProject(projectId);
  if (!project || project.mode !== "team" || !project.plan) throw new EscrowError("Not a team project", 400);
  if (project.status !== "active") throw new EscrowError("The plan isn't agreed yet; nothing to replan");
  if (project.plan.state === "planning") throw new EscrowError("The team is already being replanned");
  if (project.plan.pending) throw new EscrowError("A new plan is already waiting for approval");
  const affected = openMilestones(project.milestones).filter((m) => m.providerId === providerId);
  if (affected.length === 0) throw new EscrowError(`${getProvider(providerId)?.name ?? providerId} has no open work in this plan`);

  await updateProject(projectId, (p) => {
    p.plan!.unavailable = [...new Set([...p.plan!.unavailable, providerId])];
    p.plan!.state = "planning";
    p.plan!.trace.push({ at: new Date().toISOString(), tool: "dropout", summary: `${getProvider(providerId)?.name ?? providerId} dropped out` });
    logEvent(p, "provider_dropped_out", providerId);
  });
  void runReplanning(projectId, providerId).catch((err) => console.error("replanning failed", err));
}

export async function runReplanning(projectId: string, dropped: string) {
  const project = await getProject(projectId);
  if (!project?.goal || !project.plan) return;
  const open = openMilestones(project.milestones);
  const locked = project.milestones.filter((m) => isActive(m) && !OPEN.has(m.status));
  try {
    const result = await runPlanner({
      goal: project.goal,
      unavailable: project.plan.unavailable,
      current: { locked, open, dropped, offers: project.plan.offers },
      onTrace: (t) => updateProject(projectId, (p) => void p.plan!.trace.push(t)).then(() => {}),
    });
    // An open milestone the planner left unchanged (same provider, title and price) is kept as is.
    const keep: Record<string, string> = {};
    for (const pm of result.milestones) {
      const same = open.find((m) => !Object.values(keep).includes(m.id) && m.providerId === pm.providerId && m.amountCents === pm.amountCents && m.title === pm.title);
      if (same) keep[pm.key] = same.id;
    }
    const pending: PendingPlan = {
      version: project.plan.version + 1,
      reason: `${getProvider(dropped)?.name ?? dropped} dropped out`,
      milestones: result.milestones,
      rationale: result.rationale,
      leftoverPolicy: result.leftoverPolicy,
      changes: result.changes,
      offers: result.offers,
      keep,
    };
    await updateProject(projectId, (p) => {
      p.plan!.pending = pending;
      p.plan!.state = "ready";
      logEvent(p, "plan_change_proposed", `v${pending.version}: ${pending.reason}`);
    });
  } catch (err) {
    await updateProject(projectId, (p) => {
      p.plan!.state = "failed";
      p.plan!.error = (err as Error).message;
      logEvent(p, "replanning_failed", (err as Error).message);
    });
  }
}

/** What approving the pending plan would do with money, for the UI and the approval itself. */
export function replanEffect(milestones: Milestone[], pending: PendingPlan) {
  const keptIds = new Set(Object.values(pending.keep));
  const replaced = openMilestones(milestones).filter((m) => !keptIds.has(m.id));
  const added = pending.milestones.filter((pm) => !pending.keep[pm.key]);
  return {
    replaced,
    added,
    refundCents: replaced.filter((m) => m.status === "funded").reduce((n, m) => n + m.amountCents, 0),
    newFundingCents: added.reduce((n, m) => n + m.amountCents, 0),
  };
}

/** Client approves the new plan version: refund replaced funded work, add the new milestones. */
export async function approveReplan(projectId: string) {
  const project = await getProject(projectId);
  const pending = project?.plan?.pending;
  if (!project || !pending) throw new EscrowError("There is no new plan to approve");
  const { replaced, added } = replanEffect(project.milestones, pending);

  // Money first: each refund is idempotent, so a retry after a partial failure is safe.
  for (const m of replaced.filter((x) => x.status === "funded")) {
    await settle(m.id, 0, `Replaced in plan v${pending.version} (${pending.reason})`);
  }

  const fresh = (await getProject(projectId))!;
  const replacedIds = new Set(replaced.map((m) => m.id));
  const ids: Record<string, string> = { ...pending.keep };
  for (const pm of added) ids[pm.key] = newId("m");

  const next: Milestone[] = [];
  for (const m of fresh.milestones) {
    if (!replacedIds.has(m.id)) next.push(m);
    else if (m.status === "refunded") next.push({ ...m, replacedIn: pending.version }); // keep the money trail visible
    // replaced milestones that were never funded simply disappear
  }
  for (const pm of added) {
    next.push({
      id: ids[pm.key],
      projectId,
      providerId: pm.providerId,
      dependsOn: pm.dependsOn.map((k) => ids[k]).filter(Boolean),
      title: pm.title,
      criteria: pm.criteria,
      evidence: pm.evidence,
      dueDate: null,
      amountCents: pm.amountCents,
      currency: fresh.currency,
      status: "draft",
      events: [{ at: new Date().toISOString(), type: "added_in_plan", detail: `v${pending.version}` }],
    });
  }
  await replaceProjectMilestones(projectId, next);

  return updateProject(projectId, (p) => {
    const plan = p.plan!;
    plan.history.push({ version: pending.version, at: new Date().toISOString(), reason: pending.reason, rationale: pending.rationale, changes: pending.changes });
    plan.version = pending.version;
    plan.rationale = pending.rationale;
    plan.leftoverPolicy = pending.leftoverPolicy;
    plan.offers = pending.offers;
    plan.pending = undefined;
    plan.orderId = undefined;
    logEvent(p, "plan_change_approved", `v${pending.version}: ${replaced.length} replaced, ${added.length} added`);
  });
}
