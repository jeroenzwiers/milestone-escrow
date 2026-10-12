import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { createProjectFromAgreement } from "@/lib/projects";
import { allowAiCall } from "@/lib/ratelimit";

// Body: { agreement: string, freelancerEmail?: string }. The AI drafts the milestone plan.
// Returns the project id and one secret link token per party.
export async function POST(req: Request) {
  if (!allowAiCall(req)) {
    return NextResponse.json({ error: "Demo limit reached for AI drafting. Try again later." }, { status: 429 });
  }
  return handle(async () => {
    const body = await req.json().catch(() => ({}));
    return createProjectFromAgreement({ agreement: String(body.agreement ?? ""), freelancerEmail: body.freelancerEmail });
  });
}
