// Domain types and data access. Storage itself (JSON file or Postgres) is in lib/db.ts.
import { backend } from "./db";
import type { PlannedMilestone } from "./plan";

export type MilestoneStatus =
  | "draft" // agreed (or still being agreed), not yet paid by the client
  | "awaiting_funding" // PayPal order created, client approving
  | "funded" // captured, held by the platform, waiting for delivery
  | "in_review" // freelancer delivered; the AI reviewer is checking it
  | "changes_requested" // reviewer (or client) found unmet criteria; freelancer can resubmit
  | "needs_review" // reviewer couldn't decide; the client decides
  | "verified" // all criteria met; auto-release after the challenge window
  | "disputed" // a party contested the outcome; AI mediation proposes a split
  | "released" // fully paid out to the freelancer
  | "refunded" // fully returned to the client
  | "split"; // partly paid out, partly refunded

export type AuditEvent = { at: string; type: string; detail?: string };

export type Issue = { severity: "info" | "warning"; message: string };

export type Role = "client" | "freelancer";

export type Project = {
  id: string;
  title: string;
  clientName: string | null;
  freelancerName: string | null;
  freelancerEmail: string;
  currency: string;
  // "proposed" until both parties approve the plan; only then can milestones be funded.
  status: "proposed" | "active";
  approvals: Record<Role, boolean>;
  // SHA-256 hashes of each party's secret link token (see lib/access.ts).
  // In team mode every provider has its own link instead of one freelancer link.
  access?: { client: string; freelancer?: string; providers?: Record<string, string> };
  // "agreement": one freelancer, plan drafted from an agreement. "team": plan assembled from a goal.
  mode?: "agreement" | "team";
  goal?: Goal;
  plan?: PlanMeta;
  agreement: string;
  issues: Issue[];
  createdAt: string;
  events: AuditEvent[];
};

export type Goal = {
  text: string;
  budgetCents: number;
  deadline: string | null;
  context: string;
};

/** A provider agent's answer to a request for an offer. */
export type Offer = {
  providerId: string;
  scope: string;
  accepted: boolean;
  priceCents: number;
  conditions: string[];
  deliverable: string;
  durationDays: number;
  note: string;
};

export type PlanRevision = {
  version: number;
  at: string;
  reason: string;
  rationale: string;
  changes: string[];
};

export type PlanMeta = {
  version: number;
  rationale: string;
  leftoverPolicy: string;
  offers: Offer[];
  /** Planner and provider-agent steps, shown live while the plan is assembled. */
  trace: TraceEntry[];
  history: PlanRevision[];
  /** Providers that dropped out; they are not asked again. */
  unavailable: string[];
  orderId?: string;
  /** "planning" while the agents work in the background. */
  state?: "planning" | "ready" | "failed";
  error?: string;
  /** A replanned version waiting for the client's approval. */
  pending?: PendingPlan;
};

export type PendingPlan = {
  version: number;
  reason: string;
  milestones: PlannedMilestone[];
  rationale: string;
  leftoverPolicy: string;
  changes: string[];
  offers: Offer[];
  /** Planner key -> id of an existing open milestone that stays unchanged. */
  keep: Record<string, string>;
};

export type Milestone = {
  id: string;
  projectId: string;
  // Team mode: who delivers and gets paid for this milestone, and what must be done first.
  providerId?: string;
  dependsOn?: string[];
  /** Set when a later plan version replaced this milestone (it was refunded or never funded). */
  replacedIn?: number;
  title: string;
  criteria: string[];
  evidence: string;
  dueDate: string | null;
  amountCents: number;
  currency: string;
  status: MilestoneStatus;
  orderId?: string;
  captureId?: string;
  payout?: { batchId: string; amountCents: number; feeCents: number; status: string };
  refund?: { id: string; amountCents: number; status: string };
  submissions?: Submission[];
  releaseAt?: string; // end of the challenge window when status is "verified"
  dispute?: Dispute;
  events: AuditEvent[];
};

export type CriterionVerdict = {
  criterion: string;
  verdict: "met" | "not_met" | "unclear";
  confidence: number; // 0..1
  explanation: string;
  evidenceRefs: string[];
};

export type TraceEntry = { at: string; tool: string; summary: string };

export type Verification = {
  startedAt: string;
  finishedAt?: string;
  // Decided by policy in code from the per-criterion verdicts, not by the model directly.
  decision?: "approve" | "request_changes" | "needs_human";
  summary?: string;
  feedback?: string;
  criteria?: CriterionVerdict[];
  trace: TraceEntry[];
  error?: string;
};

export type Submission = {
  id: string;
  at: string;
  note: string;
  links: string[];
  // `path` is the storage key; `url` is a short-lived signed link added when a project is served.
  files: { name: string; path: string; mediaType: string; size: number; url?: string }[];
  verification?: Verification;
};

export type SettlementProposal = {
  at: string;
  freelancerSharePercent: number; // 0..100
  shareCents: number;
  rationale: string;
  considerations: { criterion: string; assessment: string }[];
  acceptedBy: Record<Role, boolean>;
};

export type Dispute = {
  at: string;
  raisedBy: Role;
  // Each party's side of the story, in their own words.
  statements: Partial<Record<Role, string>>;
  proposal?: SettlementProposal;
};

export type ProjectWithMilestones = Project & { milestones: Milestone[] };

export type Db = { projects: Project[]; milestones: Milestone[] };

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function getProject(id: string): Promise<ProjectWithMilestones | undefined> {
  const found = await backend.getProject(id);
  return found && { ...(found.project as Project), milestones: found.milestones as Milestone[] };
}

export async function getMilestone(id: string): Promise<Milestone | undefined> {
  return (await backend.getMilestone(id)) as Milestone | undefined;
}

export async function findMilestone(pred: (m: Milestone) => boolean): Promise<Milestone | undefined> {
  return ((await backend.allMilestones()) as Milestone[]).find(pred);
}

export async function listMilestonesWhere(pred: (m: Milestone) => boolean): Promise<Milestone[]> {
  return ((await backend.allMilestones()) as Milestone[]).filter(pred);
}

export function insertProject(project: Project, milestones: Milestone[]): Promise<void> {
  return backend.insert(project, milestones);
}

export function updateProject(id: string, fn: (p: Project, milestones: Milestone[]) => void): Promise<ProjectWithMilestones> {
  return backend.mutateProject(id, (p, ms) => {
    fn(p as Project, ms as Milestone[]);
    return { ...(p as Project), milestones: ms as Milestone[] };
  });
}

export function updateMilestone(id: string, fn: (m: Milestone) => void): Promise<Milestone> {
  return backend.mutateMilestone(id, (m) => {
    fn(m as Milestone);
    return m as Milestone;
  });
}

/** Replace a project's milestones, e.g. with a newly accepted team plan. */
export function replaceProjectMilestones(projectId: string, milestones: Milestone[]): Promise<void> {
  return backend.setMilestones(projectId, milestones);
}

/** Replace all data with the demo scenario under fixed ids. Used by tests. */
export function resetStore(): Promise<void> {
  const { projects, milestones } = demoScenario("p_bakery", ["m1", "m2", "m3"]);
  return backend.replaceAll(projects, milestones);
}

/** A fresh copy of the demo scenario with its own ids, e.g. one per visitor. */
export function newDemoScenario(): Db {
  return demoScenario(newId("p"), [newId("m"), newId("m"), newId("m")]);
}

// Uploaded evidence files, stored in the same backend as the data.
export const putFile = (key: string, mediaType: string, data: Buffer) => backend.putFile(key, { mediaType, data });
export const getFile = (key: string) => backend.getFile(key);

// Webhook idempotency that survives restarts when backed by Postgres.
export const isEventProcessed = (id: string) => backend.isProcessed(id);
export const markEventProcessed = (id: string) => backend.markProcessed(id);

// Persistent counters, e.g. daily totals for the AI rate limits.
export const bumpCounter = (key: string) => backend.bump(key);

export function logEvent(target: { events: AuditEvent[] }, type: string, detail?: string) {
  target.events.push({ at: new Date().toISOString(), type, detail });
}

// Demo scenario: a bakery hires a freelance developer for a webshop; plan already agreed.
function demoScenario(projectId: string, [m1, m2, m3]: string[]): Db {
  const currency = process.env.CURRENCY ?? "EUR";
  const freelancerEmail = process.env.FREELANCER_PAYPAL_EMAIL ?? "";
  const project: Project = {
    id: projectId,
    title: "Webshop for Bakery De Gouden Korst",
    clientName: "Sanne (De Gouden Korst)",
    freelancerName: "Daan",
    freelancerEmail,
    currency,
    status: "active",
    approvals: { client: true, freelancer: true },
    agreement: "",
    issues: [],
    createdAt: new Date().toISOString(),
    events: [{ at: new Date().toISOString(), type: "plan_agreed", detail: "Demo project" }],
  };
  const base = { projectId, currency, status: "draft" as const, dueDate: null, events: [] };
  return {
    projects: [project],
    milestones: [
      {
        ...base,
        id: m1,
        title: "Design & product catalogue",
        amountCents: 40000,
        criteria: [
          "The homepage introduces the bakery with a welcome section and an about section",
          "The catalogue lists all 24 products, each with an image, a description and a price",
          "The site works on a phone: no horizontal scrolling and the products are shown in a readable grid",
        ],
        evidence: "Link to the pull request, the live URL, and desktop and mobile screenshots",
      },
      {
        ...base,
        id: m2,
        title: "Ordering & checkout with PayPal",
        amountCents: 60000,
        criteria: [
          "Customers can add products to an order and pay for it with PayPal (sandbox)",
          "Customers receive an order confirmation email after paying",
          "Customers must choose a pickup time slot at checkout",
        ],
        evidence: "Link to the pull request and the live URL",
      },
      {
        ...base,
        id: m3,
        title: "Launch & handover",
        amountCents: 20000,
        criteria: [
          "The site is live at its public web address",
          "The owner can change products and prices without developer help",
          "A handover document explaining how to do that is delivered",
        ],
        evidence: "Live URL and the handover document",
      },
    ],
  };
}
