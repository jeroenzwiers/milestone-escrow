// Week-1 persistence: a JSON file in data/. Swap for Postgres before deploying
// (Render's disk is ephemeral); everything goes through these functions.
import { promises as fs } from "node:fs";
import path from "node:path";

export type MilestoneStatus =
  | "draft" // agreed, not yet paid by the client
  | "awaiting_funding" // PayPal order created, client approving
  | "funded" // captured, held by the platform
  | "released" // fully paid out to the freelancer
  | "refunded" // fully returned to the client
  | "split"; // partly paid out, partly refunded

export type MilestoneEvent = { at: string; type: string; detail?: string };

export type Milestone = {
  id: string;
  projectTitle: string;
  title: string;
  criteria: string[];
  amountCents: number;
  currency: string;
  freelancerEmail: string;
  status: MilestoneStatus;
  orderId?: string;
  captureId?: string;
  payout?: { batchId: string; amountCents: number; feeCents: number; status: string };
  refund?: { id: string; amountCents: number; status: string };
  events: MilestoneEvent[];
};

const DB_FILE = path.join(process.cwd(), "data", "db.json");

type Db = { milestones: Milestone[] };

async function load(): Promise<Db> {
  try {
    return JSON.parse(await fs.readFile(DB_FILE, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    const db = seed();
    await save(db);
    return db;
  }
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

export async function listMilestones(): Promise<Milestone[]> {
  return (await load()).milestones;
}

export async function getMilestone(id: string): Promise<Milestone | undefined> {
  return (await load()).milestones.find((m) => m.id === id);
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

export function logEvent(m: Milestone, type: string, detail?: string) {
  m.events.push({ at: new Date().toISOString(), type, detail });
}

// Demo scenario: a bakery hires a freelance developer for a webshop.
function seed(): Db {
  const currency = process.env.CURRENCY ?? "USD";
  const freelancerEmail = process.env.FREELANCER_PAYPAL_EMAIL ?? "";
  const base = { projectTitle: "Webshop for Bakery De Gouden Korst", currency, freelancerEmail, status: "draft" as const, events: [] };
  return {
    milestones: [
      {
        ...base,
        id: "m1",
        title: "Design & product catalogue",
        amountCents: 40000,
        criteria: ["Homepage design matches the approved mockup", "Catalogue lists all 24 products with photos and prices", "Layout is responsive on mobile"],
      },
      {
        ...base,
        id: "m2",
        title: "Checkout with PayPal",
        amountCents: 60000,
        criteria: ["Customers can pay with PayPal in sandbox", "Order confirmation email is sent", "Pickup time slot can be chosen at checkout"],
      },
      {
        ...base,
        id: "m3",
        title: "Launch & handover",
        amountCents: 20000,
        criteria: ["Site is live on the bakery's domain", "Owner can edit products without developer help", "Handover document delivered"],
      },
    ],
  };
}
