// Persistence: a JSON file in data/. Swap for Postgres before deploying
// (Render's disk is ephemeral); everything goes through these functions.
import { promises as fs } from "node:fs";
import path from "node:path";

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
  agreement: string;
  issues: Issue[];
  createdAt: string;
  events: AuditEvent[];
};

export type Milestone = {
  id: string;
  projectId: string;
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
  files: { name: string; path: string; mediaType: string; size: number }[];
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

const DB_FILE = path.join(process.cwd(), "data", "db.json");

type Db = { projects: Project[]; milestones: Milestone[] };

async function load(): Promise<Db> {
  try {
    const db = JSON.parse(await fs.readFile(DB_FILE, "utf8"));
    if (Array.isArray(db.projects)) return db;
    // Week-1 file without projects: start over with the seeded scenario.
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const db = seed();
  await save(db);
  return db;
}

async function save(db: Db) {
  await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

// Serialize writes so concurrent requests can't clobber each other's changes.
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function listProjects(): Promise<ProjectWithMilestones[]> {
  const db = await load();
  return db.projects
    .map((p) => ({ ...p, milestones: db.milestones.filter((m) => m.projectId === p.id) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getProject(id: string): Promise<ProjectWithMilestones | undefined> {
  const db = await load();
  const p = db.projects.find((x) => x.id === id);
  return p && { ...p, milestones: db.milestones.filter((m) => m.projectId === id) };
}

export async function getMilestone(id: string): Promise<Milestone | undefined> {
  return (await load()).milestones.find((m) => m.id === id);
}

export async function findMilestone(pred: (m: Milestone) => boolean): Promise<Milestone | undefined> {
  return (await load()).milestones.find(pred);
}

export async function listMilestonesWhere(pred: (m: Milestone) => boolean): Promise<Milestone[]> {
  return (await load()).milestones.filter(pred);
}

export function insertProject(project: Project, milestones: Milestone[]): Promise<void> {
  return exclusive(async () => {
    const db = await load();
    db.projects.push(project);
    db.milestones.push(...milestones);
    await save(db);
  });
}

export function updateProject(id: string, fn: (p: Project, milestones: Milestone[]) => void): Promise<ProjectWithMilestones> {
  return exclusive(async () => {
    const db = await load();
    const p = db.projects.find((x) => x.id === id);
    if (!p) throw new Error(`Project ${id} not found`);
    const milestones = db.milestones.filter((m) => m.projectId === id);
    fn(p, milestones);
    await save(db);
    return { ...p, milestones };
  });
}

export function updateMilestone(id: string, fn: (m: Milestone) => void): Promise<Milestone> {
  return exclusive(async () => {
    const db = await load();
    const m = db.milestones.find((x) => x.id === id);
    if (!m) throw new Error(`Milestone ${id} not found`);
    fn(m);
    await save(db);
    return m;
  });
}

export function resetStore(): Promise<void> {
  return exclusive(() => save(seed()));
}

export function logEvent(target: { events: AuditEvent[] }, type: string, detail?: string) {
  target.events.push({ at: new Date().toISOString(), type, detail });
}

// Demo scenario: a bakery hires a freelance developer for a webshop; plan already agreed.
function seed(): Db {
  const currency = process.env.CURRENCY ?? "EUR";
  const freelancerEmail = process.env.FREELANCER_PAYPAL_EMAIL ?? "";
  const projectId = "p_bakery";
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
    createdAt: "2026-10-01T09:00:00.000Z",
    events: [{ at: "2026-10-01T09:00:00.000Z", type: "plan_agreed", detail: "Seeded demo project" }],
  };
  const base = { projectId, currency, status: "draft" as const, dueDate: null, events: [] };
  return {
    projects: [project],
    milestones: [
      {
        ...base,
        id: "m1",
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
        id: "m2",
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
        id: "m3",
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
