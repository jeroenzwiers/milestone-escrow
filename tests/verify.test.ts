import "./setup";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CriterionVerdict } from "../lib/store";
import { alignVerdicts, decide } from "../lib/verify";

const v = (verdict: CriterionVerdict["verdict"], confidence = 0.95): CriterionVerdict => ({ criterion: "c", verdict, confidence, explanation: "", evidenceRefs: [] });

describe("decide (payout policy)", () => {
  it("approves only when every criterion is met with enough confidence", () => {
    assert.equal(decide([v("met"), v("met", 0.8)]), "approve");
  });
  it("never approves on low confidence", () => {
    assert.equal(decide([v("met"), v("met", 0.79)]), "needs_human");
  });
  it("sends unclear criteria to a human", () => {
    assert.equal(decide([v("met"), v("unclear")]), "needs_human");
  });
  it("requests changes as soon as one criterion is not met", () => {
    assert.equal(decide([v("met"), v("unclear"), v("not_met", 0.2)]), "request_changes");
  });
});

describe("alignVerdicts", () => {
  const agreed = ["Shows all 24 products", "Works on a phone"];
  const g = (criterion: string, verdict: CriterionVerdict["verdict"], confidence = 0.9) => ({ criterion, verdict, confidence, explanation: criterion, evidenceRefs: [] });

  it("matches by text, not by position", () => {
    const out = alignVerdicts(agreed, [g("Works on a phone", "not_met"), g("Shows all 24 products", "met")]);
    assert.deepEqual(out.map((o) => o.verdict), ["met", "not_met"]);
  });
  it("tolerates case and punctuation differences", () => {
    const out = alignVerdicts(agreed, [g("shows all 24 products.", "met"), g("WORKS ON A PHONE", "met")]);
    assert.deepEqual(out.map((o) => o.verdict), ["met", "met"]);
  });
  it("turns a missing or renamed criterion into unclear with zero confidence", () => {
    const out = alignVerdicts(agreed, [g("Shows all 24 products", "met"), g("Responsive design", "met")]);
    assert.equal(out[1].verdict, "unclear");
    assert.equal(out[1].confidence, 0);
    assert.equal(decide(out), "needs_human");
  });
  it("does not let one verdict count for two identical criteria", () => {
    const out = alignVerdicts(["Has a logo", "Has a logo"], [g("Has a logo", "met")]);
    assert.deepEqual(out.map((o) => o.verdict), ["met", "unclear"]);
  });
  it("clamps confidence and treats NaN as zero", () => {
    const out = alignVerdicts(agreed, [g("Shows all 24 products", "met", 7), g("Works on a phone", "met", Number.NaN)]);
    assert.deepEqual(out.map((o) => o.confidence), [1, 0]);
  });
});
