import { handle, type RouteContext } from "@/lib/api";
import { dispute } from "@/lib/delivery";

export function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    const { reason } = await req.json().catch(() => ({}));
    return dispute(id, String(reason ?? ""));
  });
}
