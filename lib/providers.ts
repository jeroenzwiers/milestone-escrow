// Demo provider catalog for team mode. The public profile is what the planner sees;
// the private terms are only known to that provider's own agent (lib/team.ts), so
// the planner has to ask and negotiate rather than read them off.
// These are demo agents, labelled as such in the UI; payouts go to sandbox accounts.

export type Provider = {
  id: string;
  name: string;
  kind: "developer" | "content" | "delivery";
  /** What the planner may know before asking. */
  publicProfile: string;
  /** Only the provider's own agent sees these. */
  privateTerms: string;
  /** Lowest price this provider accepts for its standard scope, in cents. Enforced in code. */
  floorCents: number;
  emailEnv: string;
};

export const PROVIDERS: Provider[] = [
  {
    id: "daan",
    name: "Daan Visser",
    kind: "developer",
    publicProfile: "Freelance web developer. Builds small webshops and booking flows, PayPal checkout integrations, static sites on GitHub Pages.",
    privateTerms:
      "Standard rate for adding ordering + PayPal checkout + pickup or delivery time slots to an existing small site: €180. Will not go below €150. Can start Monday and needs 3 working days. Needs the final menu and product texts before going live. Will only take the job if the client has (or will create) a PayPal business account.",
    floorCents: 15_000,
    emailEnv: "FREELANCER_PAYPAL_EMAIL",
  },
  {
    id: "studio-pixel",
    name: "Studio Pixel",
    kind: "developer",
    publicProfile: "Small web agency. Webshops, custom design, integrations.",
    privateTerms:
      "Minimum project size €250. Fully booked until two weeks from now; can only start after that. Does not do partial jobs on someone else's site.",
    floorCents: 25_000,
    emailEnv: "FREELANCER_PAYPAL_EMAIL",
  },
  {
    id: "noor",
    name: "Noor de Wit",
    kind: "content",
    publicProfile: "Copywriter and food photographer for small hospitality businesses.",
    privateTerms:
      "Menu + product texts + simple product photos for up to 30 items: €60. Texts only, no photos: €35. Delivers within 2 working days. Needs access to the products (visit to the shop) for photos.",
    floorCents: 3_500,
    emailEnv: "PROVIDER_NOOR_EMAIL",
  },
  {
    id: "fietskoerier",
    name: "Fietskoerier Demodorp",
    kind: "delivery",
    publicProfile: "Bike courier for local shops and restaurants in Demodorp.",
    privateTerms:
      "Setup fee to connect a shop for lunch delivery: €50 for the first week, then €3.50 per delivery, invoiced weekly. Only delivers between 11:00 and 13:00, within 3 km, and only on days with at least 10 orders. Needs the order list per delivery round by 10:30.",
    floorCents: 5_000,
    emailEnv: "PROVIDER_FIETSKOERIER_EMAIL",
  },
  {
    id: "bezorgbende",
    name: "BezorgBende",
    kind: "delivery",
    publicProfile: "Regional delivery service with electric vans and bikes.",
    privateTerms:
      "Setup fee to connect a shop: €75 for the first week, then per delivery. Delivers 10:00–16:00, within 8 km, no minimum number of orders. Can start the next working day.",
    floorCents: 7_500,
    emailEnv: "PROVIDER_BEZORGBENDE_EMAIL",
  },
];

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function providerEmail(id: string): string {
  const p = getProvider(id);
  return (p && process.env[p.emailEnv]) || "";
}
