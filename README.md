# Milestone Escrow

**Give it a goal and a budget, and a team assembles to make it happen. Everyone is paid from escrow when their part is verified as done.**

A bakery owner writes: *"I want to start online lunch orders next week. €300."* Nobody offers that as one package. Milestone Escrow's planner agent asks provider agents (a developer, a copywriter, couriers) for offers, negotiates within the budget, and proposes one plan: who does what, in which order, for how much, and how each result will be checked. The owner approves and funds the whole plan with one PayPal payment. When a provider drops out, the planner repairs the plan and shows what that does to the money. Each provider is paid out by PayPal only after an AI reviewer has verified their delivery against the agreed acceptance criteria; anything unspent goes back to the client.

The same escrow also works for a classic one-to-one job: paste a quote or email, and the AI turns it into milestones with checkable criteria for one client and one freelancer.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). **This is a sandbox prototype**: all payments run in the PayPal sandbox with test money, the providers in team mode are AI agents with their own private terms, and it is not a regulated escrow service (see [Limitations](#limitations)).

## What it does

| | |
|---|---|
| **Team from a goal** | A planner agent (Claude Opus 5.5, tool use) asks provider agents for offers, makes at most one counter-offer per provider, and submits a plan. Provider agents (Claude Haiku 5.5) answer under private terms the planner can't see: minimum price, availability, conditions. Every plan must pass fixed rules in code before the client sees it. |
| **Replanning** | A provider drops out (or withdraws itself). Delivered and paid work stays locked, unchanged work is kept, the rest is renegotiated. The client sees the changes and their effect on money (refund for replaced work, funding for new work) and approves plan v2. |
| **Plan from an agreement** | Paste a quote, email or chat; Claude turns it into milestones with amounts, objectively checkable acceptance criteria and the evidence to submit, and flags gaps that could cause a dispute. Both parties approve the same version. |
| **Funding** | The client pays with the PayPal JS SDK v6 (Orders v2). A team plan is funded with one order; each milestone settles its own share of that capture. |
| **AI review of deliveries** | The provider submits notes, links and screenshots/PDFs. A Claude agent inspects them with tools (GitHub pull requests via the API, public web pages) and judges every criterion with an explanation and a confidence score. |
| **Automatic payout** | Code, not the model, turns the verdicts into a decision. Everything met with high confidence starts a challenge window, followed by a PayPal Payout to that provider (minus a platform fee). Unmet criteria go back with feedback; uncertainty goes to the client. |
| **Disputes** | The client can object to a verified delivery, the provider can contest a rejection. Both state their side, Claude proposes a split per criterion, and PayPal executes it (partial payout plus partial refund) once both accept the same proposal. |

## Try it

**Demo video (2 min):** <https://youtu.be/pW8FYUzBmHI>

**Hosted demo:** <https://milestone-escrow.onrender.com>. The site is password protected so bots can't spend the AI budget; the login is in the Devpost testing instructions. The free instance sleeps when idle, so the first page can take up to a minute.

1. **Try the team demo** gives you your own copy of the bakery goal with the team the agents assembled for it in an earlier, recorded run (labelled as such). Approve it, fund it with the client sandbox account, then open *Demo: let a provider drop out* and watch the planner repair the plan live.
2. Switch **Acting as** to a provider and deliver. The developer's work is a real repository, [jeroenzwiers/gouden-korst-webshop](https://github.com/jeroenzwiers/gouden-korst-webshop), live at <https://jeroenzwiers.github.io/gouden-korst-webshop/>. For the team plan's order page, submit [PR #2](https://github.com/jeroenzwiers/gouden-korst-webshop/pull/2): it adds ordering and PayPal checkout but deliberately lacks the agreed confirmation email, so the reviewer asks for changes. For the courier, upload the fictional trial-week delivery log in [`demo/evidence/`](demo/evidence/).
3. **Single-freelancer demo** is the one-to-one version of the bakery job. Its first milestone (homepage and catalogue) is met by [PR #1](https://github.com/jeroenzwiers/gouden-korst-webshop/pull/1) plus the live URL and the screenshots in `demo/evidence/`.
4. **Start from a goal** runs the agents live on your own goal (about a minute). **From an agreement** drafts milestones from a quote.

Every visitor's demo is a private copy; you can act as the client and as every provider in your own browser.

## How the AI is kept in check

- **The model never moves money itself.** The planner proposes; `checkPlan()` in `lib/plan.ts` rejects any plan that exceeds the budget (including money already locked), books a provider for anything other than its accepted offer or below its floor, uses an unavailable provider, or has circular dependencies. The rejection goes back to the planner to fix.
- **Payout policy in code.** The reviewer returns a verdict per criterion; `decide()` in `lib/verify.ts` allows an automatic payout only when every criterion is met with at least 80% confidence. Verdicts are matched to criteria by text, never by position, so a skipped criterion becomes "unclear" and can't pay out.
- **People can always step in.** Every automatic payout waits for a challenge window (`CHALLENGE_WINDOW_MINUTES`); plan changes need the client's approval; a split needs both parties.
- **Evidence and offers are untrusted data.** The reviewer can only open links from the submission (and pages on the same sites), private and internal addresses are blocked, and instructions hidden in notes, pull requests or pages are ignored and flagged. Run `INJECT=1 npm run ai:verify` to see a prompt-injection attempt fail.
- **Private provider terms stay on the server.** The UI receives provider names and kinds only.
- **Everything is visible.** What the agents asked, offered, rejected and concluded is stored with the project and shown to the parties.

## How the money moves

```
Client ──(one PayPal order per plan version)──▶ Platform account
                                                  ├──(Payout, minus fee)──▶ Provider A
                                                  ├──(Payout, minus fee)──▶ Provider B
                                                  └──(Refund: unspent or replaced work)──▶ Client
```

Milestone states: `draft → awaiting_funding → funded → in_review → verified → released`, with `changes_requested`, `needs_review`, `disputed`, `refunded` and `split` along the way. All money movement goes through `lib/escrow.ts`, which enforces the state machine, takes one operation per milestone at a time, and makes retries idempotent with `PayPal-Request-Id` headers and deterministic payout batch ids. A split that fails halfway can be retried without paying out twice.

## Who can do what

There are no accounts. Each party gets a **personal link** with a random token; the server stores only its SHA-256 hash and derives the caller's role from it on every request (`lib/access.ts`). Whatever role the browser claims is ignored. The token travels in the link's `#fragment` and a request header, never in a URL the server sees; uploaded files are served through short-lived signed URLs.

| Action | Client | Provider / freelancer |
|---|---|---|
| View the plan | ✓ | ✓ |
| Approve a plan from an agreement | ✓ | ✓ |
| Approve a team plan or a replanned version | ✓ | (agreed through its offer) |
| Fund, release, split, refund, request changes | ✓ | |
| Submit work, contest a rejection, withdraw from a team plan | | ✓ (own milestones only) |
| Object to a verified delivery | ✓ | |
| Add a statement, ask for and accept a mediation proposal | ✓ | ✓ |

## Limitations

- **Sandbox prototype, not a regulated escrow service.** Funds are held on the platform's sandbox account. A production version would use PayPal's multiparty platform with delayed disbursement, so PayPal rather than the platform holds the money.
- **Providers are demo agents.** There is no provider sign-up or marketplace; the five providers are AI agents with fixed private terms, and their payouts go to sandbox accounts.
- **Personal links are bearer credentials.** Whoever has a link acts as that party. Fine for a demo; a real service needs accounts.
- **After a payout there is no clawback.** The challenge window is the moment to object; after that, PayPal's own dispute process applies.
- **The team demo starts from a recorded plan** so visitors don't wait; replanning and everything after it runs live.

## Run it yourself

Requires Node 20+, a PayPal developer account and an Anthropic API key.

1. **PayPal sandbox app** at [developer.paypal.com](https://developer.paypal.com/) → *Apps & Credentials* → *Sandbox* → *Create App* (Merchant). Under **Features**, enable **Payouts**.
2. **Sandbox accounts** (*Testing Tools → Sandbox Accounts*): the default business account is the platform. Create personal accounts for the client, the freelancer/developer, and the three other demo providers.
3. Configure and run:
   ```bash
   cp .env.example .env.local   # fill in PayPal, Anthropic and the sandbox account emails
   npm install
   npm run sandbox:check        # credentials + Payouts permission
   npm run sandbox:e2e          # pay → capture → 70% payout → 30% refund against the real sandbox
   npm run sandbox:team-e2e     # one payment for a team plan → payouts to three providers' own accounts + a refund
   npm test                     # 70 unit tests, no accounts needed
   npm run test:pg              # the same tests against Postgres (PGlite, in-process)
   npm run dev                  # http://localhost:3000
   ```
4. Optional AI scripts: `npm run ai:extract` (agreement → plan), `npm run ai:verify` (review a delivery), `npm run ai:plan` (team planning plus a dropout).

Without `DATABASE_URL` data is stored in `data/db.json`; with it (e.g. a Neon Postgres URL) in Postgres. For a hosted deployment, `render.yaml` describes the Render service; set `SITE_PASSWORD` to put the site behind a password, and point a PayPal webhook at `/api/webhooks/paypal` with `PAYPAL_WEBHOOK_ID` (without it the app polls payout status). AI use is capped per address per hour and per day (`AI_LIMIT_PER_DAY`, `PLAN_LIMIT_PER_DAY`), with the daily totals stored in the database.

## Project layout

| Path | What |
|---|---|
| `lib/team.ts` | Provider agents, planner agent, team projects, the recorded team demo |
| `lib/plan.ts` | Plan guardrails: budget, accepted prices, floors, availability, dependencies |
| `lib/replan.ts` | Dropouts, replanning, approving a new plan version and its money effect |
| `lib/providers.ts` | Demo provider catalog (public profiles and private terms) |
| `lib/escrow.ts` | Escrow state machine: funding (per milestone or per plan), release, split, refund |
| `lib/paypal.ts` | PayPal REST client: OAuth, Orders, Captures refund, Payouts, webhook verification |
| `lib/verify.ts` | Delivery review agent and the payout decision policy |
| `lib/evidence.ts` | Review tools: GitHub pull requests, public web pages (SSRF-guarded) |
| `lib/delivery.ts` | Submitting work, the review, challenge window, disputes, auto-release |
| `lib/mediation.ts` | Statements, AI split proposals, two-party acceptance |
| `lib/ai.ts`, `lib/projects.ts` | Agreement → milestone plan, edits and two-party approval |
| `lib/access.ts` | Personal links and role checks for every API route |
| `lib/store.ts`, `lib/db.ts` | Domain types and storage (JSON file or Postgres), files, counters |
| `lib/files.ts` | Short-lived signed URLs for uploaded evidence |
| `lib/webhooks.ts` | PayPal webhook events (payout status, disputes), idempotent |
| `lib/ratelimit.ts`, `lib/siteauth.ts`, `proxy.ts` | AI rate limits and the site password |
| `app/`, `components/` | UI and API routes |
| `tests/` | Unit tests (PayPal replaced by a recording fake) |
| `scripts/` | Sandbox checks and AI scripts |
| `docs/TEAM-MODE.md` | Design notes for team mode |
| `demo/` | Video script and demo evidence |

## License

MIT
