// Verifies the sandbox setup before building on it: credentials work and the
// REST app is allowed to do everything the escrow needs.
import { grantedScopes } from "../lib/paypal";

const REQUIRED = {
  "Orders / Checkout": "https://uri.paypal.com/services/payments/payment",
  Refunds: "https://uri.paypal.com/services/payments/refund",
  Payouts: "https://uri.paypal.com/payments/payouts",
};

async function main() {
  const scopes = await grantedScopes();
  console.log("✔ Credentials OK\n");

  let ok = true;
  for (const [name, scope] of Object.entries(REQUIRED)) {
    const has = scopes.some((s) => s.startsWith(scope));
    ok &&= has;
    console.log(`${has ? "✔" : "✘"} ${name}`);
  }

  const env = ["NEXT_PUBLIC_PAYPAL_CLIENT_ID", "FREELANCER_PAYPAL_EMAIL"];
  for (const key of env) {
    const has = Boolean(process.env[key]);
    ok &&= has;
    console.log(`${has ? "✔" : "✘"} ${key} set`);
  }

  if (!ok) {
    console.log("\nFix the ✘ items. Payouts: developer.paypal.com > Apps & Credentials > your sandbox app > Features > enable Payouts.");
    process.exit(1);
  }
  console.log("\nAll good. Next: npm run sandbox:e2e");
}

main().catch((err) => {
  console.error("✘", err.message);
  process.exit(1);
});
