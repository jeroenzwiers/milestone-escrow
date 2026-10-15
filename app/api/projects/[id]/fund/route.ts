import { authorizeProject } from "@/lib/access";
import { handle, type RouteContext } from "@/lib/api";
import { startPlanFunding } from "@/lib/escrow";
import { approveLink } from "@/lib/paypal";

// Team mode: one PayPal order for every unfunded milestone of the approved plan.
// The button sends no body. A caller paying through the approve link instead (the video
// recorder) may pass a returnUrl on this same site for PayPal to send the payer back to.
export function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    await authorizeProject(req, id, ["client"]);
    const body = await req.json().catch(() => ({}));
    const returnUrl = typeof body?.returnUrl === "string" && sameOrigin(body.returnUrl, req.url) ? body.returnUrl : undefined;
    const order = await startPlanFunding(id, returnUrl ? { returnUrl, cancelUrl: returnUrl } : undefined);
    return { orderId: order.id, approveUrl: approveLink(order) };
  });
}

function sameOrigin(url: string, base: string) {
  try {
    return new URL(url).origin === new URL(base).origin;
  } catch {
    return false;
  }
}
