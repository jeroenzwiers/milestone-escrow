import { NextResponse } from "next/server";
import { authorizeMilestone } from "@/lib/access";
import { handle, type RouteContext } from "@/lib/api";
import { submitWork } from "@/lib/delivery";
import { allowAiCall } from "@/lib/ratelimit";

// multipart/form-data: note, links (one per line), files[]
export function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    await authorizeMilestone(req, id, ["freelancer"]);
    // Every submission starts an AI review.
    if (!(await allowAiCall(req))) return NextResponse.json({ error: "Demo limit reached for AI reviews. Try again later." }, { status: 429 });
    const form = await req.formData();
    return submitWork(id, {
      note: String(form.get("note") ?? ""),
      links: String(form.get("links") ?? "").split(/\s+/),
      files: form.getAll("files").filter((f): f is File => f instanceof File),
    });
  });
}
