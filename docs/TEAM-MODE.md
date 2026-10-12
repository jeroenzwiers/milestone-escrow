# Team mode: a goal assembles its own team

> "I gave it a goal and a budget. In front of me, the team that could make it happen came together."

Today a project has one client and one freelancer who already agreed on the work. Team mode starts one step earlier: the client only states a **goal**, a **budget** and a **deadline**. A planner agent asks provider agents for offers, composes one plan in which each milestone is done and paid by a different provider, and repairs that plan when a provider drops out. Everything after approval reuses what exists: escrow, AI verification of each delivery, PayPal payouts, refunds and disputes.

## Demo story (bakery, ~1:30 of the video)

1. The owner of De Gouden Korst: *"I want to start online lunch orders next week. €300, my current website and this menu."*
2. Three provider agents respond with offers and conditions: a developer (Daan), a content writer (Noor) and a bike courier (Fietskoerier Demodorp, only within 11:00–13:00 and from 10 orders a day).
3. The planner composes one plan within budget: checkout first, product texts in parallel, delivery once checkout is live. Each milestone has acceptance criteria, evidence, a payee and dependencies. The owner approves and funds the whole plan with one PayPal payment.
4. **Disruption:** the courier drops out. The planner asks the alternatives, finds BezorgBende (more expensive but available) and proposes plan v2: same budget, delivery window adjusted, product texts shortened to stay within €300. Only the changed part needs re-approval.
5. Daan delivers (the real webshop pull request), the AI verifies it and PayPal pays Daan; the same happens for the others. Unused budget is refunded to the owner.

## What is new

| Part | Description |
|---|---|
| Provider catalog | Demo providers with a public profile (skills, typical price) and private constraints (minimum price, availability, conditions). Each has its own PayPal sandbox account. |
| Provider agents | One Claude call per offer request, playing that provider with its private constraints. Returns a structured offer: accept/decline, price, conditions, deliverable, duration. Can accept or reject one counter-offer. |
| Planner agent | Tool use: `request_offer`, `counter_offer`, `propose_plan`. Decomposes the goal, collects offers, composes the plan, explains trade-offs and what happens to leftover budget. |
| Plan guardrails (code, not AI) | Total ≤ budget; every price equals an accepted offer; dependencies are acyclic; only catalog providers; a changed plan needs the client's approval again. |
| Multi-payee milestones | Each milestone has `providerId` and pays out to that provider. The whole plan is funded with one PayPal order; each milestone settles its own share of that capture (payout to its provider, partial refund of the rest). |
| Replanning | Triggered when a provider drops out. Keeps finished and verified work, re-offers the open part, proposes plan v2 as a diff. Money for affected milestones stays in escrow until approval. |
| Access | The client link plus one link per provider. A provider can only deliver its own milestones. |

## Explicitly out of scope

- Real provider sign-up or a marketplace. Providers are demo agents, and the UI labels them as such.
- Negotiation beyond one counter-offer per provider.
- Changing the budget without the client's approval.

## Build order

1. Data model, provider catalog, multi-payee milestones, plan funding with one order (tests first).
2. Provider agent + planner agent with guardrails, `npm run ai:plan` script.
3. UI: goal intake, live negotiation trace, plan with dependencies and approval.
4. Disruption + replanning with diff and re-approval.
5. Per-provider links, delivery and payouts per provider; demo seed and video script update.

Feature freeze: **5 November 2026**. After that only fixes, the hosted demo, the Devpost text and the video.
