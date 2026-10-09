// Caps paid AI calls so a public demo can't drain the API credit.
// In-memory, per server process: good enough for a single demo instance.
const PER_IP_PER_HOUR = Number(process.env.AI_LIMIT_PER_IP_PER_HOUR ?? 10);
const GLOBAL_PER_DAY = Number(process.env.AI_LIMIT_PER_DAY ?? 200);

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

export function allowAiCall(req: Request): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  return take(`ip:${ip}`, PER_IP_PER_HOUR, 3_600_000) && take("global", GLOBAL_PER_DAY, 86_400_000);
}
