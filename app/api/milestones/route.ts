import { handle } from "@/lib/api";
import { listMilestones, resetStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(() => listMilestones());
}

// Demo reset: restores the seeded scenario (does not touch PayPal).
export function DELETE() {
  return handle(async () => {
    await resetStore();
    return listMilestones();
  });
}
