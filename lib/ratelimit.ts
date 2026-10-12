// Caps paid AI calls so a public demo can't drain the API credit.
// Per-address limits are kept in memory (they only need to slow one visitor down);
// the daily totals are kept in the storage backend, so a restart of a sleeping free
// instance doesn't reset them.
import { bumpCounter } from "./store";

const PER_IP_PER_HOUR = Number(process.env.AI_LIMIT_PER_IP_PER_HOUR ?? 10);
const AI_PER_DAY = Number(process.env.AI_LIMIT_PER_DAY ?? 100);
const PLANS_PER_IP_PER_HOUR = Number(process.env.PLAN_LIMIT_PER_IP_PER_HOUR ?? 5);
const PLANS_PER_DAY = Number(process.env.PLAN_LIMIT_PER_DAY ?? 20);
const DEMOS_PER_DAY = Number(process.env.DEMO_LIMIT_PER_DAY ?? 200);

const hits = new Map<string, number[]>();

function take(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

/** Counts one more use today (UTC) for `kind`; false once the daily total is exceeded. */
async function underDailyTotal(kind: string, limit: number): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  return (await bumpCounter(`${kind}:${day}`)) <= limit;
}

// Number of reverse proxies in front of the app that append to X-Forwarded-For
// (1 on Render). Entries to the left of those were sent by the client and can be forged.
const TRUSTED_PROXY_HOPS = Number(process.env.TRUSTED_PROXY_HOPS ?? 0);

export function clientIp(forwardedFor: string | null, trustedHops = TRUSTED_PROXY_HOPS): string {
  if (!forwardedFor || trustedHops <= 0) return "direct";
  const hops = forwardedFor.split(",").map((s) => s.trim()).filter(Boolean);
  // The rightmost entry is added by the closest trusted proxy and is the address it saw.
  return hops[hops.length - trustedHops] ?? hops[0] ?? "direct";
}

const ipOf = (req: Request) => clientIp(req.headers.get("x-forwarded-for"));

/** One AI call (drafting a plan from an agreement, reviewing a delivery, mediating). */
export async function allowAiCall(req: Request): Promise<boolean> {
  return take(`ip:${ipOf(req)}`, PER_IP_PER_HOUR, 3_600_000) && (await underDailyTotal("ai", AI_PER_DAY));
}

/** A team plan or replan takes many agent calls; capped separately and more tightly. */
export async function allowPlanning(req: Request): Promise<boolean> {
  return take(`plan:${ipOf(req)}`, PLANS_PER_IP_PER_HOUR, 3_600_000) && (await underDailyTotal("plan", PLANS_PER_DAY));
}

/** Demo copies are cheap (no AI), but each one is stored; cap them per address and per day. */
export async function allowDemoStart(req: Request): Promise<boolean> {
  return take(`demo:${ipOf(req)}`, 20, 3_600_000) && (await underDailyTotal("demo", DEMOS_PER_DAY));
}
