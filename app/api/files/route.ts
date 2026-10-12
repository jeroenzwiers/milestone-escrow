import { NextResponse } from "next/server";
import { verifyFileUrl } from "@/lib/files";
import { getFile } from "@/lib/store";

// Serves an uploaded evidence file from a short-lived signed URL (see lib/files.ts).
// Signed URLs are only handed out to holders of a valid personal link.
export async function GET(req: Request) {
  const key = verifyFileUrl(new URL(req.url).searchParams);
  if (!key) return NextResponse.json({ error: "This file link has expired. Reload the project page." }, { status: 403 });
  const file = await getFile(key);
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });
  const name = key.split("/").pop() ?? "file";
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mediaType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(name)}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "private, max-age=600",
    },
  });
}
