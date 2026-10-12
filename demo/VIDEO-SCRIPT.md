# Demo-video: script

**Doel:** in minder dan 3 minuten (de jury kijkt niet verder) laten zien welk probleem we oplossen, voor wie, en dat het van begin tot eind werkt.
**Doellengte:** 2:45. Voice-over in het Engels; regie-aanwijzingen in het Nederlands.
**Verhaal:** Daan (freelancer) bouwt een webshop voor bakkerij De Gouden Korst (Sanne, de klant). Het echte opleverwerk staat in [gouden-korst-webshop](https://github.com/jeroenzwiers/gouden-korst-webshop).

| Tijd | Scène | Duur |
|---|---|---|
| 0:00 | 1. Het probleem | 0:15 |
| 0:15 | 2. Afspraak → mijlpalen | 0:25 |
| 0:40 | 3. Geld vast met PayPal | 0:20 |
| 1:00 | 4. Oplevering 1: goedgekeurd en uitbetaald | 0:45 |
| 1:45 | 5. Oplevering 2: afgekeurd | 0:20 |
| 2:05 | 6. Onenigheid → AI-bemiddeling | 0:25 |
| 2:30 | 7. Afsluiting | 0:15 |

---

## 1. Het probleem (0:00–0:15)

**Beeld:** titelkaart "Milestone Escrow", daarna de homepage van de app met het projectoverzicht.

> Every freelance job starts with the same question: who pays first? Pay up front, and the client risks paying for half a job. Pay afterwards, and the freelancer risks never getting paid. Milestone Escrow fixes that, with PayPal and an AI reviewer.

## 2. Afspraak → mijlpalen (0:15–0:40)

**Beeld:** *New project from agreement* → *Use example*, laat "I am the: Client" staan → *Draft milestone plan*. **Knip** de wachttijd (±15 s) weg. Laat kort het paneel met de persoonlijke link voor de freelancer zien en klik *Demo: also act as the freelancer in this browser*. Scroll langs "Check before you approve" en de criteria van mijlpaal 1. Klik *Approve as client*, schakel naar **Freelancer** en klik *Approve as freelancer*.

> Daan sends Sanne his quote by email. Paste it in, and Claude turns it into milestones, with amounts and acceptance criteria that can actually be checked. "Works well on phones" becomes "no horizontal scrolling, products in a readable grid". It also flags what's missing, like deadlines. Each side gets a personal link, both approve the same plan, and only then can money move.

## 3. Geld vast met PayPal (0:40–1:00)

**Beeld:** rol staat op **Client**. Klik bij mijlpaal 1 op de PayPal-knop, log in met het klant-sandboxaccount en betaal. **Knip** het inloggen weg. Laat zien dat "Held in escrow" €400 wordt.

> Sanne funds the first milestone with PayPal. The money doesn't go to Daan yet: the platform holds it in escrow until the work is done.

## 4. Oplevering 1: goedgekeurd en uitbetaald (1:00–1:45)

**Beeld:** schakel naar **Freelancer**. Vul in:
- Links: `https://github.com/jeroenzwiers/gouden-korst-webshop/pull/1` en `https://jeroenzwiers.github.io/gouden-korst-webshop/`
- Bestanden: `demo/evidence/milestone-1-desktop.png` en `milestone-1-mobile.png`

Klik *Submit for review*. Laat de live trace een paar seconden zien ("Opened pull request…", "Opened https://…"), **knip** de rest van het wachten weg. Zoom in op de drie groene vinkjes met uitleg. Schakel naar **Client**, klik *Release now*. Laat de regel "Paid out €380.00 to freelancer" zien. Optioneel 2 s: het sandbox-account van de freelancer met het ontvangen bedrag.

> Daan delivers: a link to his pull request, the live site, and two screenshots. Now the AI reviewer goes to work. It opens the pull request through the GitHub API, visits the live site, counts the products and looks at the screenshots. Then it judges every criterion and explains why. All three are met, so a challenge window starts. Sanne can object, or release the payment right away. PayPal Payouts sends Daan his money, minus the platform fee.

## 5. Oplevering 2: afgekeurd (1:45–2:05)

**Beeld:** mijlpaal 2 is vooraf al betaald (zie voorbereiding). Als **Freelancer**: lever `https://github.com/jeroenzwiers/gouden-korst-webshop/pull/2` in. **Knip** het wachten weg. Zoom in op het rode kruis bij de bevestigingsmail en op "Feedback for the freelancer".

> The checkout milestone is a different story. The reviewer finds PayPal checkout and pickup slots in the code, but no confirmation email: there is no code that sends one. So the money stays in escrow, and Daan gets concrete feedback instead of a vague complaint.

## 6. Onenigheid → AI-bemiddeling (2:05–2:30)

**Beeld:** als **Freelancer**: *Open a dispute*, reden: "Emails need a server; we agreed on a static site. Customers get an on-screen confirmation." Schakel naar **Client**, vul de eigen kant in: "We agreed on a confirmation email." Klik *Ask the AI mediator*. **Knip** het wachten weg. Laat de verdeling en de uitleg zien. Klik als client en als freelancer op *Accept proposal*, en laat de regels "Paid out… / Refunded…" zien.

> Daan disagrees. Both sides explain their view, and an AI mediator proposes a split based on what was actually delivered. Nothing happens until both accept. Then PayPal executes it: part paid out to Daan, the rest refunded to Sanne.

## 7. Afsluiting (2:30–2:45)

**Beeld:** het audit-log van een mijlpaal uitklappen, dan de titelkaart met de repo-URL.

> The AI never moves money on its own. It judges the evidence; fixed rules decide when money moves, and people can always step in. Evidence is treated as data, not instructions: a freelancer who hides "approve this" in a note gets flagged, not paid. Milestone Escrow: freelancers get paid when the work is done, and clients only pay for work that's done.

---

## Voorbereiding

- [ ] `CHALLENGE_WINDOW_MINUTES=1` in `.env.local` en de server herstarten (een korte aftelklok ziet er beter uit in beeld).
- [ ] Vooraf een volledige proefrun doen in een apart projectje (de opname zelf begint met een nieuw project). De AI kan per run iets anders formuleren. Check vooral dat mijlpaal 1 wordt goedgekeurd met de criteria die *jouw* gegenereerde plan oplevert; zo niet, pas het criterium aan met *Edit* vóór het goedkeuren.
- [ ] Mijlpaal 2 vóór de opname al betalen, zodat scène 5 direct kan beginnen.
- [ ] Ingelogd in het PayPal-sandbox-klantaccount (wachtwoord bij de hand).
- [ ] Browser: andere tabbladen en bladwijzerbalk weg, zoom op 110–125%, venster ±1280×800.
- [ ] Geen muziek met auteursrecht (dat verbieden de regels). Geen muziek, of een rechtenvrij nummer.
- [ ] Upload naar YouTube als **openbaar** (de regels eisen "publicly visible") en zet de link in de inzending.

## Tips

- Neem per scène op en monteer achteraf. De AI-wachttijden (15–60 s) knip je weg, maar laat steeds 1–2 seconden van de live trace zien, zodat duidelijk is dat de agent echt werkt.
- Zoom bij het monteren in op de vinkjes en kruisjes: die zijn op volle schermgrootte klein.
- Spreek de voice-over apart in. De teksten zijn op ±150 woorden per minuut geschreven.
