// Who is calling? Each project has one secret link per party. Only a hash of each
// token is stored; the role is derived from the token on the server, never taken
// from what the browser claims.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { EscrowError } from "./escrow";
import { getMilestone, getProject, type Project, type Role } from "./store";

export const TOKEN_HEADER = "x-escrow-token";

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sameHash(a: string, b: string) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Fresh tokens for both parties, plus the hashes to store on the project. */
export function issueAccess(): { tokens: Record<Role, string>; access: { client: string; freelancer: string } } {
  const tokens = { client: newToken(), freelancer: newToken() };
  return { tokens, access: { client: hashToken(tokens.client), freelancer: hashToken(tokens.freelancer) } };
}

/** Team mode: a client link plus one link per provider. */
export function issueTeamAccess(providerIds: string[]) {
  const client = newToken();
  const providers = Object.fromEntries(providerIds.map((id) => [id, newToken()]));
  return {
    tokens: { client, providers },
    access: { client: hashToken(client), providers: Object.fromEntries(Object.entries(providers).map(([id, t]) => [id, hashToken(t)])) },
  };
}

export type Party = { role: Role; providerId?: string };

export function partyFor(project: Pick<Project, "access">, token: string | null | undefined): Party | null {
  if (!token || !project.access) return null;
  const h = hashToken(token);
  if (sameHash(h, project.access.client)) return { role: "client" };
  if (project.access.freelancer && sameHash(h, project.access.freelancer)) return { role: "freelancer" };
  for (const [providerId, hash] of Object.entries(project.access.providers ?? {})) {
    if (sameHash(h, hash)) return { role: "freelancer", providerId };
  }
  return null;
}

export function roleFor(project: Pick<Project, "access">, token: string | null | undefined): Role | null {
  return partyFor(project, token)?.role ?? null;
}

// Header only: link tokens are never accepted from URLs, so they don't end up in logs.
function tokenOf(req: Request): string | null {
  return req.headers.get(TOKEN_HEADER);
}

/** Resolve the caller's role on a project, or fail with 401/403. */
export async function authorizeProject(
  req: Request,
  projectId: string,
  allowed: Role[] = ["client", "freelancer"],
): Promise<{ role: Role; providerId?: string; project: Project }> {
  const project = await getProject(projectId);
  // Same answer for "no such project" and "wrong link", so ids can't be probed.
  const party = project ? partyFor(project, tokenOf(req)) : null;
  if (!project || !party) throw new EscrowError("This link is not valid for this project", 401);
  if (!allowed.includes(party.role)) throw new EscrowError(`Only the ${allowed.join(" or ")} can do this`, 403);
  return { ...party, project };
}

export async function authorizeMilestone(req: Request, milestoneId: string, allowed?: Role[]) {
  const m = await getMilestone(milestoneId);
  if (!m) throw new EscrowError("This link is not valid for this project", 401);
  const auth = await authorizeProject(req, m.projectId, allowed);
  // In team mode a provider may only act on its own milestones.
  if (auth.providerId && m.providerId !== auth.providerId) throw new EscrowError("This milestone belongs to another provider", 403);
  return auth;
}
