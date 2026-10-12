import type { Verification } from "@/lib/store";

const DECISION: Record<NonNullable<Verification["decision"]>, { label: string; tone: string }> = {
  approve: { label: "All criteria met", tone: "ok" },
  request_changes: { label: "Changes needed", tone: "bad" },
  needs_human: { label: "Reviewer unsure: client decides", tone: "warn" },
};

const ICON = { met: "✓", not_met: "✗", unclear: "?" } as const;

/** The AI reviewer's verdict per acceptance criterion. */
export function VerificationPanel({ verification: v }: { verification: Verification }) {
  if (v.error) {
    return (
      <div className="notice warn">
        <strong>The AI review could not be completed.</strong> {v.error} The client decides instead.
      </div>
    );
  }
  if (!v.decision || !v.criteria) return null;
  const d = DECISION[v.decision];

  return (
    <div className="verification">
      <div className={`verdict ${d.tone}`}>
        <span className="verdict-label">AI review · {d.label}</span>
        <p>{v.summary}</p>
      </div>
      <ul className="checks">
        {v.criteria.map((c) => (
          <li key={c.criterion} className={c.verdict}>
            <span className="icon" aria-label={c.verdict}>{ICON[c.verdict]}</span>
            <div>
              <p className="criterion">{c.criterion}</p>
              <p className="small muted">
                {c.explanation} <span className="confidence">{Math.round(c.confidence * 100)}% confident</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
      {v.feedback && (
        <div className="feedback">
          <p className="label">Feedback for the freelancer</p>
          <p className="small" style={{ whiteSpace: "pre-wrap" }}>{v.feedback}</p>
        </div>
      )}
      {v.trace.length > 0 && (
        <details>
          <summary className="muted small">What the reviewer checked ({v.trace.length} steps)</summary>
          <ol className="trace">
            {v.trace.map((t, i) => <li key={i}>{t.summary}</li>)}
          </ol>
        </details>
      )}
    </div>
  );
}
