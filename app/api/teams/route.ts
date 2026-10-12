import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { allowAiCall, allowPlanning } from "@/lib/ratelimit";
import { createTeamProject } from "@/lib/team";

// Body: { goal, budget (euros), deadline?, context?, clientName? }.
// Returns the project id, the client link token and one link token per provider.
export async function POST(req: Request) {
  if (!(await allowPlanning(req))) {
    return NextResponse.json({ error: "Demo limit reached for team planning. Try again later." }, { status: 429 });
  }
  return handle(async () => {
    const body = await req.json().catch(() => ({}));
    return createTeamProject({
      goal: String(body.goal ?? ""),
      budgetCents: Math.round(Number(body.budget) * 100),
      deadline: body.deadline ? String(body.deadline) : undefined,
      context: body.context ? String(body.context) : undefined,
      clientName: body.clientName ? String(body.clientName) : undefined,
    });
  });
}
