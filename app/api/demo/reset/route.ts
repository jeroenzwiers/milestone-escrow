import { handle } from "@/lib/api";
import { listProjects, resetStore } from "@/lib/store";

// Restores the seeded demo scenario (does not touch PayPal).
export function POST() {
  return handle(async () => {
    await resetStore();
    return listProjects();
  });
}
