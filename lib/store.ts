// Week-1/2 persistence: a JSON file in data/. Swap for Postgres before deploying
// (Render's disk is ephemeral); everything goes through these functions.
import { promises as fs } from "node:fs";
import path from "node:path";

export type MilestoneStatus =
  | "draft" // agreed (or still being agreed), not yet paid by the client
  | "awaiting_funding" // PayPal order created, client approving
  | "funded" // captured, held by the platform
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
  events: AuditEvent[];
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
        criteria: ["Homepage design matches the approved mockup", "Catalogue lists all 24 products with photos and prices", "Layout is responsive on mobile"],
        evidence: "Staging URL plus desktop and mobile screenshots",
      },
      {
        ...base,
        id: "m2",
        title: "Checkout with PayPal",
        amountCents: 60000,
        criteria: ["Customers can pay with PayPal in sandbox", "Order confirmation email is sent", "Pickup time slot can be chosen at checkout"],
        evidence: "Staging URL plus a screen recording of a test order",
      },
      {
        ...base,
        id: "m3",
        title: "Launch & handover",
        amountCents: 20000,
        criteria: ["Site is live on the bakery's domain", "Owner can edit products without developer help", "Handover document delivered"],
        evidence: "Live URL and the handover document",
      },
    ],
  };
}
