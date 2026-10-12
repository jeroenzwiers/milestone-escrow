// Evidence the verification agent can look at: GitHub pull requests and public
// web pages. Everything returned here is untrusted data written by the freelancer
// (or the internet) and is passed to the model as such.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_PAGE_BYTES = 2_000_000;
const MAX_PAGE_CHARS = 30_000;
const MAX_PATCH_CHARS = 15_000;
const MAX_DIFF_CHARS = 60_000;
const TIMEOUT_MS = 10_000;

export class EvidenceError extends Error {}

// ---------- SSRF guard ----------

function isPrivateAddress(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new EvidenceError(`Not a valid URL: ${raw}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new EvidenceError("Only http(s) URLs can be opened");
  if (url.username || url.password) throw new EvidenceError("URLs with credentials are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new EvidenceError(`${url.hostname} is not a public address`);
  }
  return url;
}

/** fetch() that re-checks every redirect hop against the SSRF guard. */
async function safeFetch(raw: string, headers: Record<string, string> = {}): Promise<Response> {
  let current = raw;
  for (let hop = 0; hop < 4; hop++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, url).toString();
      continue;
    }
    return res;
  }
  throw new EvidenceError("Too many redirects");
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PAGE_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

// ---------- Web pages ----------

function htmlToText(html: string): { title: string; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
  const text = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, " [image: $1] ")
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return { title: decodeEntities(title), text };
}

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export async function fetchWebPage(url: string): Promise<string> {
  const res = await safeFetch(url, { "User-Agent": "MilestoneEscrowReviewer/1.0", Accept: "text/html,text/plain;q=0.9,*/*;q=0.1" });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok) return `HTTP ${res.status} when opening ${url}. The page is not reachable.`;
  if (!/text\/|json|xml/.test(type)) return `${url} returned ${type || "unknown content"}, which can't be read as text.`;
  const body = await readCapped(res);
  const { title, text } = type.includes("html") ? htmlToText(body) : { title: "", text: body };
  const clipped = text.length > MAX_PAGE_CHARS ? `${text.slice(0, MAX_PAGE_CHARS)}\n[… page truncated]` : text;
  return `URL: ${res.url || url}\nHTTP ${res.status}\nTitle: ${title || "(none)"}\n\n${clipped}`;
}

// ---------- GitHub pull requests ----------

const PR_URL = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/i;

export function isGitHubPullRequest(url: string) {
  return PR_URL.test(url);
}

async function gh<T>(path: string): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "MilestoneEscrowReviewer/1.0" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) throw new EvidenceError("Pull request not found (it may be in a private repository).");
  if (res.status === 403 || res.status === 429) throw new EvidenceError("GitHub rate limit reached; set GITHUB_TOKEN to raise it.");
  if (!res.ok) throw new EvidenceError(`GitHub API returned ${res.status}`);
  return res.json() as Promise<T>;
}

type PullRequest = {
  title: string;
  body: string | null;
  state: string;
  merged: boolean;
  merged_at: string | null;
  draft: boolean;
  user: { login: string };
  base: { ref: string };
  head: { sha: string; ref: string };
  commits: number;
  additions: number;
  deletions: number;
  changed_files: number;
};
type PrFile = { filename: string; status: string; additions: number; deletions: number; patch?: string };
type CheckRuns = { check_runs: { name: string; status: string; conclusion: string | null }[] };

export async function fetchGitHubPullRequest(url: string): Promise<string> {
  const match = url.match(PR_URL);
  if (!match) throw new EvidenceError("Not a GitHub pull request URL");
  const [, owner, repo, number] = match;
  const base = `/repos/${owner}/${repo}`;

  const pr = await gh<PullRequest>(`${base}/pulls/${number}`);
  const files = await gh<PrFile[]>(`${base}/pulls/${number}/files?per_page=100`);
  const checks = await gh<CheckRuns>(`${base}/commits/${pr.head.sha}/check-runs?per_page=50`).catch(() => ({ check_runs: [] }));

  let diffBudget = MAX_DIFF_CHARS;
  const fileLines = files.map((f) => {
    let patch = f.patch ?? "(binary or too large to show)";
    if (patch.length > MAX_PATCH_CHARS) patch = `${patch.slice(0, MAX_PATCH_CHARS)}\n[… patch truncated]`;
    if (diffBudget <= 0) patch = "(diff omitted: total diff budget used)";
    diffBudget -= patch.length;
    return `### ${f.filename} (${f.status}, +${f.additions} −${f.deletions})\n${patch}`;
  });

  const checkLines = checks.check_runs.length
    ? checks.check_runs.map((c) => `- ${c.name}: ${c.conclusion ?? c.status}`).join("\n")
    : "(no CI checks reported)";

  return [
    `Pull request ${owner}/${repo}#${number}: ${pr.title}`,
    `Author: ${pr.user.login} · ${pr.head.ref} → ${pr.base.ref}`,
    `State: ${pr.merged ? `merged at ${pr.merged_at}` : pr.draft ? "draft" : pr.state} · ${pr.commits} commits · ${pr.changed_files} files · +${pr.additions} −${pr.deletions}`,
    `CI checks:\n${checkLines}`,
    `Description:\n${pr.body?.trim() || "(empty)"}`,
    `Changed files:\n${fileLines.join("\n\n")}`,
  ].join("\n\n");
}
