# Milestone Escrow

**Freelancers get paid when the work is done, and clients only pay for work that's done.**
Clients fund project milestones up front with PayPal. The platform holds the money, and an AI agent checks each delivery against the agreed acceptance criteria before it releases the payout. When the client and freelancer disagree, the agent proposes a fair split and settles it.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). Everything runs in the PayPal sandbox.

## Status

- [x] **Week 1: money flow.** Fund a milestone (JS SDK v6 + Orders v2), hold it, then release (Payouts), refund (Captures refund) or split between both.
- [x] **Week 2: AI milestone plans.** Paste a quote, email or chat. Claude turns it into milestones with amounts, objectively checkable acceptance criteria and the evidence to submit, and flags gaps that could cause a dispute later. Both parties can edit the plan and must approve the same version before anything can be funded.
- [ ] Week 3: verification agent (GitHub PRs, documents, screenshots), challenge window, auto-release, webhooks.
- [ ] Week 4: AI mediation and split proposals, polish, hosted demo.

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
   npm run dev                  # http://localhost:3000
   ```
4. In the app, click **New project from agreement** → **Use example** to let the AI draft a plan. Review it, approve it as both parties, then fund a milestone with the **client** sandbox account and release, split or refund it. The seeded bakery project is already approved if you want to skip straight to payments.

## Project layout

| Path | What |
|---|---|
| `lib/paypal.ts` | PayPal REST client: OAuth, Orders, Captures refund, Payouts |
| `lib/escrow.ts` | Escrow state machine and guardrails |
| `lib/ai.ts` | Claude: agreement → milestone plan (structured output) |
| `lib/projects.ts` | Plan lifecycle: AI draft, edits, two-party approval |
| `lib/store.ts` | Persistence (JSON file for now) and the seeded demo scenario |
| `lib/ratelimit.ts` | Caps AI calls so a public demo can't drain the API credit |
| `app/api/projects/…` | Create from agreement, edit milestones, approve |
| `app/api/milestones/…` | `order`, `capture`, `release` (full or split), `refund` |
| `app/`, `components/` | UI: project list, new project, plan review, funding with the PayPal JS SDK v6 |
| `scripts/` | Sandbox setup check and end-to-end money flow test |

## License

MIT
