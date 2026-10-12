# Milestone Escrow

**Freelancers get paid when the work is done, and clients only pay for work that's done.**
Clients fund project milestones up front with PayPal. The platform holds the money, and an AI agent checks each delivery against the agreed acceptance criteria before it releases the payout. When the client and freelancer disagree, the agent proposes a fair split and settles it.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). Everything runs in the PayPal sandbox.

## Status

- [x] **Week 1: money flow.** Fund a milestone (JS SDK v6 + Orders v2), hold it, then release (Payouts), refund (Captures refund) or split between both.
- [x] **Week 2: AI milestone plans.** Paste a quote, email or chat. Claude turns it into milestones with amounts, objectively checkable acceptance criteria and the evidence to submit, and flags gaps that could cause a dispute later. Both parties can edit the plan and must approve the same version before anything can be funded.
- [x] **Week 3: AI verification.** The freelancer submits notes, links and screenshots/PDFs. A Claude agent inspects the evidence with tools (GitHub pull requests via the API, public web pages) and judges every acceptance criterion with an explanation and a confidence score. Policy in code turns that into a decision: all met with high confidence starts a challenge window followed by automatic payout; anything unmet goes back to the freelancer with feedback; uncertainty goes to the client. PayPal webhooks keep payout status current.
- [x] **Week 4a: AI mediation.** The client can object to a verified delivery and the freelancer can contest a rejection. Both state their side, Claude proposes a split with reasoning per criterion, and PayPal executes it (partial payout and partial refund) only once both parties accept the same proposal.
- [ ] Week 4b: hosted demo, demo deliverable, polish.

## Demo deliverable

The seeded project is a webshop for a fictional bakery. Its deliverable is a real repository, [jeroenzwiers/gouden-korst-webshop](https://github.com/jeroenzwiers/gouden-korst-webshop), live at <https://jeroenzwiers.github.io/gouden-korst-webshop/>:

- **Milestone 1** ([PR #1](https://github.com/jeroenzwiers/gouden-korst-webshop/pull/1), merged): homepage and catalogue. Submit the PR, the live URL and the screenshots in `demo/evidence/`, and the reviewer approves it.
- **Milestone 2** ([PR #2](https://github.com/jeroenzwiers/gouden-korst-webshop/pull/2), open): ordering and PayPal checkout, but deliberately **without** the agreed confirmation email. Submit the PR and the reviewer asks for changes.

## How the AI is kept in check

- The model never moves money itself. It returns a verdict per criterion; `decide()` in `lib/verify.ts` maps verdicts to an outcome, and only "every criterion met with at least 80% confidence" can lead to an automatic payout.
- Every automatic payout waits for a challenge window (`CHALLENGE_WINDOW_MINUTES`) in which the client can object or release early.
- Evidence is treated as untrusted data. The agent can only open links from the submission (and pages on the same sites), private and internal network addresses are blocked, and instructions hidden in notes, pull requests or pages are ignored and flagged. Run `INJECT=1 npm run ai:verify` to see a prompt-injection attempt fail.
- What the agent opened and concluded is stored with the milestone and shown to both parties.

## How the money moves

```
Client ──(PayPal checkout)──▶ Platform account ──(Payouts, minus fee)──▶ Freelancer
                                      └──────────(Refund)──────────────▶ Client
```

Milestone states: `draft → awaiting_funding → funded → released | refunded | split`.
All money movement goes through `lib/escrow.ts`, which enforces the state machine, takes one operation per milestone at a time, and makes retries idempotent by sending `PayPal-Request-Id` headers and deterministic payout batch ids.

> In production this would use PayPal's multiparty platform with delayed disbursement rather than holding funds on the platform account.

## Setup

Requires Node 20+, a PayPal developer account and an Anthropic API key.

1. **Create sandbox credentials** at [developer.paypal.com](https://developer.paypal.com/) → *Apps & Credentials* → *Sandbox* → *Create App* (type: Merchant). Under the app's **Features**, make sure **Payouts** is enabled.
2. **Sandbox accounts** (*Testing Tools → Sandbox Accounts*). The default business account is the platform. You need two **personal** accounts: one is the client (it pays), the other is the freelancer (it receives payouts).
3. Configure:
   ```bash
   cp .env.example .env.local   # then fill in the values
   npm install
   npm run sandbox:check        # verifies credentials + Payouts permission
   npm run sandbox:e2e          # pay → capture → 70% payout → 30% refund, against the real sandbox
   npm run ai:extract           # agreement → milestone plan on the demo email (needs ANTHROPIC_API_KEY)
   npm run ai:verify            # verification agent on a sample delivery (INJECT=1 for an injection attempt)
   npm test                     # unit tests: payout policy, money flow, disputes, webhooks, SSRF guard (no accounts needed)
   npm run dev                  # http://localhost:3000
   ```
4. Optional: once deployed, add a webhook for `https://<host>/api/webhooks/paypal` in the PayPal dashboard and set `PAYPAL_WEBHOOK_ID`. Locally the app polls payout status instead.
5. In the app, click **New project from agreement** → **Use example** to let the AI draft a plan. Review it, approve it as both parties, then fund a milestone with the **client** sandbox account and switch to **Freelancer** (top right) to submit the work. The seeded bakery project is already approved if you want to skip straight to payments.

## Project layout

| Path | What |
|---|---|
| `lib/paypal.ts` | PayPal REST client: OAuth, Orders, Captures refund, Payouts |
| `lib/escrow.ts` | Escrow state machine and guardrails |
| `lib/ai.ts` | Claude: agreement → milestone plan (structured output) |
| `lib/projects.ts` | Plan lifecycle: AI draft, edits, two-party approval |
| `lib/store.ts` | Persistence (JSON file for now) and the seeded demo scenario |
| `lib/verify.ts` | Verification agent (Claude + tools) and the payout decision policy |
| `lib/evidence.ts` | Evidence tools: GitHub pull requests, public web pages (SSRF-guarded) |
| `lib/delivery.ts` | Submit work, run the review, challenge window, disputes, auto-release |
| `lib/mediation.ts` | Disputes: statements, AI split proposal, two-party acceptance |
| `lib/webhooks.ts` | PayPal webhook events (payout status, disputes) |
| `lib/ratelimit.ts` | Caps AI calls so a public demo can't drain the API credit |
| `app/api/projects/…` | Create from agreement, edit milestones, approve |
| `app/api/milestones/…` | `order`, `capture`, `submit`, `dispute`, `request-changes`, `statement`, `mediate`, `accept`, `release` (full or split), `refund` |
| `app/api/webhooks/paypal` | Verified PayPal webhook receiver |
| `app/`, `components/` | UI: project list, new project, plan review, funding with the PayPal JS SDK v6 |
| `scripts/` | Sandbox setup check and end-to-end money flow test |

## License

MIT
