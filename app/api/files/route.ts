import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { findMilestone } from "@/lib/store";

// Serves a file attached to a submission: /api/files?path=data/uploads/...
export async function GET(req: Request) {
  const rel = new URL(req.url).searchParams.get("path") ?? "";
  const m = await findMilestone((x) => !!x.submissions?.some((s) => s.files.some((f) => f.path === rel)));
  const file = m?.submissions!.flatMap((s) => s.files).find((f) => f.path === rel);
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });
  const data = await fs.readFile(path.join(process.cwd(), file.path));
  return new NextResponse(new Uint8Array(data), {
    headers: { "Content-Type": file.mediaType, "Content-Disposition": `inline; filename="${encodeURIComponent(file.name)}"`, "X-Content-Type-Options": "nosniff" },
  });
}
