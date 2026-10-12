# Demo video: script

**Doel:** in minder dan 3 minuten (de jury kijkt niet verder) laten zien welk probleem we oplossen, voor wie, en dat het van begin tot eind werkt met PayPal en AI.
**Doellengte:** 2:45. Voice-over in het Engels; regie-aanwijzingen in het Nederlands.
**Verhaal:** Sanne van bakkerij De Gouden Korst wil volgende week online lunchbestellingen, met €300. Agents stellen een team samen, één uitvoerder valt weg, het plan herstelt zich, en iedereen wordt betaald zodra zijn deel is gecontroleerd.

| Tijd | Scène | Duur |
|---|---|---|
| 0:00 | 1. Het probleem | 0:15 |
| 0:15 | 2. Doel en budget | 0:15 |
| 0:30 | 3. De agents onderhandelen | 0:30 |
| 1:00 | 4. Goedkeuren en één PayPal-betaling | 0:15 |
| 1:15 | 5. Tegenslag: een uitvoerder valt weg | 0:30 |
| 1:45 | 6. Opleveringen: nee en ja | 0:35 |
| 2:20 | 7. Waarom je dit kunt vertrouwen | 0:25 |

> **Over live runs:** de agents formuleren elke keer net anders en kunnen andere keuzes maken. Neem scène 3 en 5 op met een run die het verhaal laat zien (zie *Voorbereiding*). De voice-over hieronder is zo geschreven dat hij past zolang de run die momenten bevat; pas namen of bedragen aan als ze in jouw run anders zijn. Laat niets zien wat niet echt gebeurd is.

---

## 1. Het probleem (0:00–0:15)

**Beeld:** titelkaart "Milestone Escrow", daarna de homepage.

> Sanne runs a bakery. She wants online lunch orders by next week, and she has three hundred euros. Nobody sells that as one package: she'd need a developer, someone for the menu, and a courier, and she'd have to coordinate them and pay up front.

## 2. Doel en budget (0:15–0:30)

**Beeld:** *Start from a goal* → *Use example* (doel, €300, "next week") → *Assemble a team*.

> With Milestone Escrow she only states the goal and the budget. Agents do the rest.

## 3. De agents onderhandelen (0:30–1:00)

**Beeld:** de live trace. **Knip** het wachten weg, maar laat de regels in beeld verschijnen. Zoom in op: een uitvoerder die weigert (Studio Pixel), het bod van de goedkopere koerier met zijn voorwaarde ("only on days with at least 10 orders"), en de regel "Plan accepted by platform rules". Eindig op het voorgestelde team, de budgetbalk en "Why this plan".

> A planner agent asks providers for offers. Each provider is an agent with its own private terms. The agency declines: it's booked for two weeks. The cheap courier only rides on days with ten or more orders, which is risky in a launch week. The planner weighs that, picks the courier without a minimum, and submits a plan. Fixed rules check it: within budget, every price exactly what the provider agreed to. Two hundred and ninety of three hundred euros.

## 4. Goedkeuren en één PayPal-betaling (1:00–1:15)

**Beeld:** *Approve plan* → *Pay with PayPal* → sandbox-login (**knippen**) → "Held in escrow €290".

> Sanne approves and pays once, with PayPal. The money sits in escrow. Nobody is paid until their part is verified.

## 5. Tegenslag: een uitvoerder valt weg (1:15–1:45)

**Beeld:** *Demo: let a provider drop out* → BezorgBende. De pagina scrolt naar de live trace (**knip** het wachten). Zoom in op het tegenbod aan de andere koerier dat geweigerd wordt, en daarna op het oranje blok "Plan v2 proposed": de wijzigingen, "Back to you" en "To fund for new work". *Approve plan v2* → betalen.

> Then the courier drops out. The planner replans: it offers the other courier more to drop the minimum, gets a no, and adds a pickup option instead so quiet days are still covered. Sanne sees exactly what changes: seventy-five euros back for the work that's replaced, a small payment for the new courier. Work that's already settled stays untouched.

## 6. Opleveringen: nee en ja (1:45–2:20)

**Beeld:** *Acting as* → **Daan Visser**: lever `https://github.com/jeroenzwiers/gouden-korst-webshop/pull/2` in. Laat 1–2 seconden van de review-trace zien ("Opened pull request…"), **knip** de rest. Zoom in op het rode kruis bij de bevestigingsmail en op de feedback.
Daarna *Acting as* → **Fietskoerier Demodorp**: upload `demo/evidence/fietskoerier-trial-week-log.pdf`. Laat de groene vinkjes zien. *Acting as* → **Client** → *Release now* → "Paid out … to provider".

> Each provider delivers. The reviewer opens Daan's pull request, finds PayPal checkout and pickup slots, but no confirmation email, so his money stays in escrow and he gets concrete feedback. The courier's delivery log checks out, criterion by criterion. After a short window in which Sanne could object, PayPal pays the courier directly.

## 7. Waarom je dit kunt vertrouwen (2:20–2:45)

**Beeld:** het audit-log of de lijst "All offers the agents received", daarna de titelkaart met de repo-URL.

> The agents negotiate and judge, but they never move money on their own: code checks every plan, decides when a payout is allowed, and every change needs Sanne's approval. Everything the agents did is on the record. Give it a goal and a budget, and the team that can make it happen comes together, and gets paid when the work is done.

---

## Voorbereiding

- [ ] **Neem lokaal op** (`npm run build` en `npm start`): sneller dan de gratis online server, en zonder inlogvenster. Zet in `.env.local` tijdelijk `CHALLENGE_WINDOW_MINUTES=1`.
- [ ] **Doe eerst een paar proefruns** van scène 2–5 en kies een run waarin het verhaal zit: de agency weigert, de koerier met het minimum valt af, BezorgBende komt in het plan, en bij de herplanning wordt de andere koerier gevraagd. Een run die anders loopt is niet fout, maar dan moet de voice-over mee.
- [ ] Ingelogd (of wachtwoord bij de hand) in het PayPal-sandbox-**klant**account `sb-ychkk…`.
- [ ] Browser: andere tabbladen en de bladwijzerbalk weg, zoom 110–125%, venster ± 1280×800.
- [ ] Geen muziek met auteursrecht (dat verbieden de regels): geen muziek, of een rechtenvrij nummer.
- [ ] Laat in beeld duidelijk zijn dat het sandbox is (de PayPal-sandbox-banner mag zichtbaar zijn) en dat de uitvoerders demo-agents zijn.
- [ ] Upload naar YouTube als **openbaar** (de regels eisen "publicly visible") en zet de link in de inzending.

## Tips

- Neem per scène op en monteer achteraf. De AI-wachttijden (15–90 s) knip je weg, maar laat steeds even zien dat er live iets gebeurt.
- Zoom bij het monteren in op de regels waar de voice-over over gaat; op volle schermgrootte zijn ze te klein.
- Spreek de voice-over apart in. De teksten zijn op ± 150 woorden per minuut geschreven; lees ze een keer hardop met een stopwatch.
