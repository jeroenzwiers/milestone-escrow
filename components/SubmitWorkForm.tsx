"use client";

import { useState } from "react";
import type { Milestone } from "@/lib/store";

/** Freelancer delivers a milestone: note, links and screenshots/PDFs. */
export function SubmitWorkForm({ milestone, onSubmitted }: { milestone: Milestone; onSubmitted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resubmit = milestone.status === "changes_requested";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/milestones/${milestone.id}/submit`, { method: "POST", body: new FormData(e.currentTarget) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      onSubmitted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="deliver" onSubmit={submit}>
      <p className="label">{resubmit ? "Resubmit your delivery" : "Deliver this milestone"}</p>
      <p className="small muted">Agreed evidence: {milestone.evidence || "anything that shows the criteria are met"}</p>
      {error && <div className="error">{error}</div>}
      <label htmlFor={`note-${milestone.id}`}>What did you deliver?</label>
      <textarea id={`note-${milestone.id}`} name="note" rows={3} placeholder="Short description of the work, and anything the reviewer should know" disabled={busy} />
      <label htmlFor={`links-${milestone.id}`}>Links (one per line)</label>
      <textarea id={`links-${milestone.id}`} name="links" rows={2} placeholder={"https://github.com/you/repo/pull/12\nhttps://staging.example.com"} disabled={busy} />
      <label htmlFor={`files-${milestone.id}`}>Screenshots or documents (PNG, JPEG, PDF · max 5 files of 5 MB)</label>
      <input id={`files-${milestone.id}`} name="files" type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp,application/pdf" disabled={busy} />
      <div className="actions">
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Submitting…" : "Submit for review"}
        </button>
      </div>
    </form>
  );
}
