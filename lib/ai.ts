// Claude-powered steps of the escrow. Server-side only.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export const MODEL = "claude-opus-5-5";
// Cheaper model for simple, high-volume calls such as the demo provider agents.
export const FAST_MODEL = process.env.FAST_MODEL || "claude-haiku-5-5";

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set (see .env.example)");
  // Only needed for keys that aren't scoped to a single workspace.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  client ??= new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
  return client;
}

export class AiError extends Error {}

const MilestonePlan = z.object({
  projectTitle: z.string().describe("Short name of the project, e.g. 'Webshop for Bakery De Gouden Korst'"),
  clientName: z.string().nullable().describe("Who pays, if mentioned"),
  freelancerName: z.string().nullable().describe("Who does the work, if mentioned"),
  currency: z.string().describe("ISO 4217 code, e.g. EUR"),
  milestones: z.array(
    z.object({
      title: z.string(),
      amount: z.number().describe("Amount in major currency units, e.g. 400 or 249.50"),
      dueDate: z.string().nullable().describe("YYYY-MM-DD if the agreement gives one"),
      acceptanceCriteria: z
        .array(z.string())
        .describe("Each criterion is one concrete, objectively checkable statement about the delivered work"),
      evidence: z.string().describe("What the freelancer should submit to prove completion, e.g. 'link to merged GitHub PR' or 'staging URL + screenshots'"),
    }),
  ),
  issues: z
    .array(
      z.object({
        severity: z.enum(["info", "warning"]),
        message: z.string(),
      }),
    )
    .describe("Ambiguities, gaps or assumptions both parties should review before agreeing"),
});
export type MilestonePlan = z.infer<typeof MilestonePlan>;

const EXTRACT_SYSTEM = `You turn freelance agreements (quotes, emails, chat messages, proposals) into a milestone plan for an escrow service. The client funds each milestone up front; the money is released to the freelancer only when the delivered work meets that milestone's acceptance criteria. An AI reviewer will later judge deliveries against these criteria, so they decide who gets paid.

Write acceptance criteria that a neutral reviewer can check from the submitted evidence: specific, observable and binary (met / not met). Turn vague wording into a concrete check where the agreement supports it ("looks professional" is not checkable; "uses the client's logo and colour palette on every page" is). Do not add requirements the parties did not agree on. When something can only be made checkable by assuming details, keep the criterion and add an issue explaining the assumption.

Amounts: use the amounts from the agreement. If only a total is given, split it over the milestones in proportion to the work and add a warning saying the split is a proposal. If the milestone amounts don't add up to a stated total, add a warning. Never invent a price when none is given; use 0 and add a warning.

Use the agreement's language for titles and criteria. Use issues for anything both parties should confirm before they sign: missing deadlines, unclear scope, unclear ownership of costs such as hosting or licences.`;

/** Turn free-text agreement into milestones with checkable acceptance criteria. */
export async function extractMilestonePlan(agreement: string, defaultCurrency: string): Promise<MilestonePlan> {
  const response = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: EXTRACT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Default currency if the agreement doesn't state one: ${defaultCurrency}\n\n<agreement>\n${agreement}\n</agreement>`,
      },
    ],
    output_config: { format: betaZodOutputFormat(MilestonePlan) },
  });

  if (response.stop_reason === "refusal") throw new AiError("The AI declined to process this agreement.");
  if (response.stop_reason === "max_tokens") throw new AiError("The agreement is too long to process in one go.");
  if (!response.parsed_output) throw new AiError("The AI returned an unreadable plan. Please try again.");
  return response.parsed_output;
}
