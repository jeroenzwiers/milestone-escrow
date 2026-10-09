// Try the agreement → milestone plan step from the command line.
// Usage: npm run ai:extract [path/to/agreement.txt]   (defaults to the bakery demo email)
import { readFileSync } from "node:fs";
import { extractMilestonePlan } from "../lib/ai";

const SAMPLE = `Hi Sanne,

Thanks for the call yesterday! As discussed, here's my proposal for the new webshop for De Gouden Korst.

1. Design + product catalogue — I'll design the homepage based on the mockup you liked and put all 24 products online with photos and prices. Has to work well on phones, since most of your customers order from their phone. €400.

2. Checkout — customers pay with PayPal, get a confirmation email, and pick a time slot to collect their order at the shop. €600.

3. Launch — I put the site live on goudenkorst.nl and show you how to change products and prices yourself. You'll also get a short manual. €200.

Total €1,200. I can start next Monday; I expect it to take about 4 weeks.

Best,
Daan`;

async function main() {
  const file = process.argv[2];
  const agreement = file ? readFileSync(file, "utf8") : SAMPLE;
  const started = Date.now();
  const plan = await extractMilestonePlan(agreement, process.env.CURRENCY ?? "EUR");
  console.log(JSON.stringify(plan, null, 2));
  console.log(`\n(${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

main().catch((err) => {
  console.error("✘", err.message);
  process.exit(1);
});
