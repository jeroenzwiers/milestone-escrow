// Short-lived signed URLs for uploaded evidence, so a party's personal link token
// never has to appear in a URL (browser history, server logs, referrers).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Milestone } from "./store";

const TTL_MS = 10 * 60_000;

// Set FILE_URL_SECRET when running more than one instance; otherwise a per-process
// secret is fine because URLs are re-issued every time a project is loaded.
const g = globalThis as { __fileUrlSecret?: string };
const secret = () => process.env.FILE_URL_SECRET || (g.__fileUrlSecret ??= randomBytes(32).toString("hex"));

const sign = (key: string, exp: number) => createHmac("sha256", secret()).update(`${key}\n${exp}`).digest("base64url");

export function signedFileUrl(key: string, now = Date.now()): string {
  const exp = now + TTL_MS;
  return `/api/files?k=${encodeURIComponent(key)}&exp=${exp}&sig=${sign(key, exp)}`;
}

/** The file key if the signature is valid and not expired, otherwise null. */
export function verifyFileUrl(params: URLSearchParams, now = Date.now()): string | null {
  const key = params.get("k");
  const exp = Number(params.get("exp"));
  const sig = params.get("sig") ?? "";
  if (!key || !Number.isFinite(exp) || exp < now) return null;
  const expected = Buffer.from(sign(key, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? key : null;
}

/** Copy of the milestones with a fresh signed URL on every attached file. */
export function withFileUrls(milestones: Milestone[]): Milestone[] {
  return milestones.map((m) => ({
    ...m,
    submissions: m.submissions?.map((s) => ({ ...s, files: s.files.map((f) => ({ ...f, url: signedFileUrl(f.path) })) })),
  }));
}
