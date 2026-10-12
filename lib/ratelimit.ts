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

// Number of reverse proxies in front of the app that append to X-Forwarded-For
// (1 on Render). Entries to the left of those were sent by the client and can be forged.
const TRUSTED_PROXY_HOPS = Number(process.env.TRUSTED_PROXY_HOPS ?? 0);

export function clientIp(forwardedFor: string | null, trustedHops = TRUSTED_PROXY_HOPS): string {
  if (!forwardedFor || trustedHops <= 0) return "direct";
  const hops = forwardedFor.split(",").map((s) => s.trim()).filter(Boolean);
  // The rightmost entry is added by the closest trusted proxy and is the address it saw.
  return hops[hops.length - trustedHops] ?? hops[0] ?? "direct";
}

export function allowAiCall(req: Request): boolean {
  const ip = clientIp(req.headers.get("x-forwarded-for"));
  return take(`ip:${ip}`, PER_IP_PER_HOUR, 3_600_000) && take("global", GLOBAL_PER_DAY, 86_400_000);
}
