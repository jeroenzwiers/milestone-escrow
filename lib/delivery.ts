// Delivery lifecycle of a funded milestone: the freelancer submits work, the AI
// reviewer checks it, and the outcome either schedules an automatic release
// after a challenge window or hands the decision back to the people involved.
import { promises as fs } from "node:fs";
import path from "node:path";
import { EscrowError, settle } from "./escrow";
import {
  getMilestone,
  getProject,
  listMilestonesWhere,
  logEvent,
  newId,
  updateMilestone,
  type Milestone,
  type Submission,
  type Verification,
} from "./store";
import { verifySubmission } from "./verify";

const CHALLENGE_WINDOW_MS = Number(process.env.CHALLENGE_WINDOW_MINUTES ?? 3) * 60_000;
const REVIEW_TIMEOUT_MS = 10 * 60_000;
const MAX_FILES = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);

function latest(m: Milestone): Submission | undefined {
  return m.submissions?.at(-1);
}

/** Freelancer delivers work for a funded milestone. Starts the AI review in the background. */
export async function submitWork(id: string, input: { note: string; links: string[]; files: File[] }) {
  const m = await getMilestone(id);
  if (!m) throw new EscrowError("Milestone not found", 404);
  if (m.status !== "funded" && m.status !== "changes_requested") {
    throw new EscrowError(`Work can't be submitted while the milestone is ${m.status.replace("_", " ")}`);
  }

  const links = input.links.map((l) => l.trim()).filter(Boolean);
  for (const link of links) {
    try {
      const u = new URL(link);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    } catch {
      throw new EscrowError(`Not a valid link: ${link}`);
    }
  }
  const files = input.files.filter((f) => f.size > 0);
  if (files.length > MAX_FILES) throw new EscrowError(`Attach at most ${MAX_FILES} files`);
  for (const f of files) {
    if (!ALLOWED_TYPES.has(f.type)) throw new EscrowError(`${f.name}: only images (PNG, JPEG, GIF, WebP) and PDFs are supported`);
    if (f.size > MAX_FILE_BYTES) throw new EscrowError(`${f.name} is larger than 5 MB`);
  }
  if (!input.note.trim() && links.length === 0 && files.length === 0) {
    throw new EscrowError("Add a note, a link or a file so the reviewer has something to check");
  }

  const submission: Submission = { id: newId("s"), at: new Date().toISOString(), note: input.note.trim(), links, files: [] };
  const dir = path.join("data", "uploads", m.id, submission.id);
  await fs.mkdir(path.join(process.cwd(), dir), { recursive: true });
  for (const [i, f] of files.entries()) {
    const safe = `${i + 1}-${f.name.replace(/[^\w.-]+/g, "_").slice(-80)}`;
    await fs.writeFile(path.join(process.cwd(), dir, safe), Buffer.from(await f.arrayBuffer()));
    submission.files.push({ name: f.name, path: path.join(dir, safe), mediaType: f.type, size: f.size });
  }

  const updated = await updateMilestone(id, (x) => {
    if (x.status !== "funded" && x.status !== "changes_requested") throw new EscrowError("Milestone changed; reload and try again", 409);
    submission.verification = { startedAt: new Date().toISOString(), trace: [] };
    x.submissions = [...(x.submissions ?? []), submission];
    x.status = "in_review";
    logEvent(x, "work_submitted", `${links.length} links, ${submission.files.length} files`);
  });

  // Runs after the response is sent; the UI polls the milestone to follow progress.
  void runReview(id).catch((err) => console.error("review failed", err));
  return updated;
}

async function setVerification(id: string, fn: (v: Verification, m: Milestone) => void) {
  return updateMilestone(id, (m) => {
    const v = latest(m)?.verification;
    if (v) fn(v, m);
  });
}

async function runReview(id: string) {
  const m = await getMilestone(id);
  const project = m && (await getProject(m.projectId));
  const submission = m && latest(m);
  if (!m || !project || !submission) return;
  const previous = m.submissions!.at(-2)?.verification;

  try {
    const result = await verifySubmission({
      project,
      milestone: m,
      submission,
      previous,
      onTrace: async (entry) => {
        await setVerification(id, (v) => void v.trace.push(entry));
      },
    });

    await setVerification(id, (v, x) => {
      Object.assign(v, result, { finishedAt: new Date().toISOString() });
      if (x.status !== "in_review") return;
      if (result.decision === "approve") {
        x.status = "verified";
        x.releaseAt = new Date(Date.now() + CHALLENGE_WINDOW_MS).toISOString();
        logEvent(x, "verified", `All criteria met; auto-release at ${x.releaseAt}`);
      } else if (result.decision === "request_changes") {
        x.status = "changes_requested";
        logEvent(x, "changes_requested", "AI reviewer found unmet criteria");
      } else {
        x.status = "needs_review";
        logEvent(x, "needs_review", "AI reviewer was not confident; client decides");
      }
    });
  } catch (err) {
    await setVerification(id, (v, x) => {
      v.error = (err as Error).message;
      v.finishedAt = new Date().toISOString();
      if (x.status === "in_review") {
        x.status = "needs_review";
        logEvent(x, "review_failed", v.error);
      }
    });
  }
}

/** Client objects during the challenge window: stops the automatic release. */
export async function dispute(id: string, reason: string) {
  if (!reason.trim()) throw new EscrowError("Explain what is wrong with the delivery");
  return updateMilestone(id, (m) => {
    if (m.status !== "verified" && m.status !== "needs_review") throw new EscrowError(`Can't object while the milestone is ${m.status.replace("_", " ")}`);
    m.status = "disputed";
    m.releaseAt = undefined;
    m.dispute = { at: new Date().toISOString(), reason: reason.trim() };
    logEvent(m, "disputed", reason.trim());
  });
}

/** Client sends the work back to the freelancer (after an unclear review or a dispute). */
export async function requestChanges(id: string, feedback: string) {
  if (!feedback.trim()) throw new EscrowError("Tell the freelancer what to change");
  return updateMilestone(id, (m) => {
    if (m.status !== "needs_review" && m.status !== "disputed" && m.status !== "verified") {
      throw new EscrowError(`Can't request changes while the milestone is ${m.status.replace("_", " ")}`);
    }
    const v = latest(m)?.verification;
    if (v) v.feedback = [v.feedback, `Client: ${feedback.trim()}`].filter(Boolean).join("\n\n");
    m.status = "changes_requested";
    m.releaseAt = undefined;
    m.dispute = undefined; // kept in the audit log
    logEvent(m, "changes_requested", `Client: ${feedback.trim()}`);
  });
}

/** Called periodically: releases verified milestones whose challenge window ended. */
export async function processDue() {
  const now = Date.now();
  const due = await listMilestonesWhere((m) => m.status === "verified" && !!m.releaseAt && Date.parse(m.releaseAt) <= now);
  for (const m of due) {
    try {
      await settle(m.id, m.amountCents, "Auto-released: the AI reviewer verified all acceptance criteria and the client did not object");
    } catch (err) {
      console.error(`auto-release of ${m.id} failed`, err);
    }
  }

  // A review interrupted by a server restart would otherwise stay "in review" forever.
  const stuck = await listMilestonesWhere((m) => m.status === "in_review" && now - Date.parse(latest(m)?.verification?.startedAt ?? m.events.at(-1)?.at ?? "") > REVIEW_TIMEOUT_MS);
  for (const m of stuck) {
    await setVerification(m.id, (v, x) => {
      v.error = "The review was interrupted.";
      v.finishedAt = new Date().toISOString();
      x.status = "needs_review";
      logEvent(x, "review_failed", v.error);
    });
  }
}
