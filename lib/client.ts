// Browser-side helpers shared by the pages.
import type { Role } from "./store";

const TOKEN_HEADER = "x-escrow-token";

// The link token of the party this browser is currently acting as. Every API call carries it;
// the server derives the role from it.
let activeToken: string | null = null;

export function setActiveToken(token: string | null) {
  activeToken = token;
}

export function authHeaders(): Record<string, string> {
  return activeToken ? { [TOKEN_HEADER]: activeToken } : {};
}

/** JSON API call carrying the active link token, or `token` when given. */
export async function api<T>(path: string, method = "GET", body?: unknown, token?: string): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { ...(token ? { [TOKEN_HEADER]: token } : authHeaders()), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

/** URL for an uploaded file; <img> can't send headers, so the token goes in the query. */
export function fileUrl(path: string): string {
  return `/api/files?path=${encodeURIComponent(path)}${activeToken ? `&t=${encodeURIComponent(activeToken)}` : ""}`;
}

export const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

export const sumCents = <T extends { amountCents: number }>(items: T[], pred: (x: T) => boolean = () => true) =>
  items.filter(pred).reduce((n, x) => n + x.amountCents, 0);

// ---------- Link tokens kept in this browser ----------
// Storage can be unavailable (private mode, blocked site data); everything degrades to "no saved links".

export type Tokens = Partial<Record<Role, string>>;
const tokensKey = (projectId: string) => `escrow:tokens:${projectId}`;
const inviteKey = (projectId: string) => `escrow:invite:${projectId}`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function loadTokens(projectId: string): Tokens {
  return read<Tokens>(tokensKey(projectId)) ?? {};
}

export function saveToken(projectId: string, role: Role, token: string) {
  write(tokensKey(projectId), { ...loadTokens(projectId), [role]: token });
}

export function forgetProject(projectId: string) {
  write(tokensKey(projectId), null);
  write(inviteKey(projectId), null);
}

/** Projects this browser holds a link for, newest first as stored. */
export function myProjectIds(): string[] {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith("escrow:tokens:"))
      .map((k) => k.slice("escrow:tokens:".length));
  } catch {
    return [];
  }
}

/** The other party's link, shown once to the creator so they can send it on. */
export type Invite = { role: Role; token: string };
export const loadInvite = (projectId: string) => read<Invite>(inviteKey(projectId));
export const saveInvite = (projectId: string, invite: Invite | null) => write(inviteKey(projectId), invite);

export const linkFor = (projectId: string, token: string) => `${window.location.origin}/projects/${projectId}?t=${encodeURIComponent(token)}`;
