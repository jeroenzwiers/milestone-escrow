import { handle, type RouteContext } from "@/lib/api";
import { submitWork } from "@/lib/delivery";

// multipart/form-data: note, links (one per line), files[]
export function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    const form = await req.formData();
    return submitWork(id, {
      note: String(form.get("note") ?? ""),
      links: String(form.get("links") ?? "").split(/\s+/),
      files: form.getAll("files").filter((f): f is File => f instanceof File),
    });
  });
}
