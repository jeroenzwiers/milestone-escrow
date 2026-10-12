import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { authorizeMilestone } from "@/lib/access";
import { EscrowError } from "@/lib/escrow";
import { findMilestone } from "@/lib/store";

// Serves a file attached to a submission: /api/files?path=data/uploads/...&t=<link token>
// (the token travels in the query because <img> tags can't send headers).
export async function GET(req: Request) {
  const rel = new URL(req.url).searchParams.get("path") ?? "";
  const m = await findMilestone((x) => !!x.submissions?.some((s) => s.files.some((f) => f.path === rel)));
  const file = m?.submissions!.flatMap((s) => s.files).find((f) => f.path === rel);
  if (!m || !file) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    await authorizeMilestone(req, m.id);
  } catch (err) {
    const status = err instanceof EscrowError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
  const data = await fs.readFile(path.join(process.cwd(), file.path));
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": file.mediaType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.name)}"`,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "private, no-store",
    },
  });
}
