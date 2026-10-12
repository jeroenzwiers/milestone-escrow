// Background loop for time-based escrow steps (auto-release after the challenge window).
import { processDue } from "./delivery";

const INTERVAL_MS = 10_000;

export function startScheduler() {
  // Survive dev-server hot reloads without starting a second loop.
  const g = globalThis as { __escrowScheduler?: NodeJS.Timeout };
  if (g.__escrowScheduler) return;
  let running = false;
  g.__escrowScheduler = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await processDue();
    } catch (err) {
      console.error("scheduler", err);
    } finally {
      running = false;
    }
  }, INTERVAL_MS);
}
