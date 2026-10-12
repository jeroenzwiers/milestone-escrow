import { NextResponse } from "next/server";
import { issueAccess } from "@/lib/access";
import { handle } from "@/lib/api";
import { allowDemoStart } from "@/lib/ratelimit";
import { insertProject, newDemoScenario } from "@/lib/store";

// Creates a private copy of the demo project for this visitor, with both parties' links,
// so judges can play both roles without affecting each other.
export async function POST(req: Request) {
  if (!(await allowDemoStart(req))) {
    return NextResponse.json({ error: "Too many demo projects from this address. Try again later." }, { status: 429 });
  }
  return handle(async () => {
    const { projects, milestones } = newDemoScenario();
    const { tokens, access } = issueAccess();
    const project = { ...projects[0], access };
    await insertProject(project, milestones);
    return { projectId: project.id, tokens };
  });
}
