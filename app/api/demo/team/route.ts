import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { allowDemoStart } from "@/lib/ratelimit";
import { createTeamDemo } from "@/lib/team";

// A private copy of the recorded team plan for this visitor, with the client link and every provider link.
export async function POST(req: Request) {
  if (!(await allowDemoStart(req))) {
    return NextResponse.json({ error: "Too many demo projects from this address. Try again later." }, { status: 429 });
  }
  return handle(() => createTeamDemo());
}
