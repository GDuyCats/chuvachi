import { purgeExpiredSessions } from "../lib/auth";
import { cancelUnpaidOrders } from "../services/order-admin-service";

const EVERY_MINUTE = 60 * 1000;

// Small jobs that run inside the API process every minute.
// (Fine for one server; if we ever run several servers, move this to a single scheduled task.)
export function startBackgroundJobs(): () => void {
  let running = false;

  const timer = setInterval(async () => {
    if (running) return; // don't start a new round while the previous one is still busy
    running = true;
    try {
      const cancelled = await cancelUnpaidOrders();
      if (cancelled > 0) {
        console.log(`Auto-cancelled ${cancelled} unpaid order(s).`);
      }
      await purgeExpiredSessions();
    } catch (error) {
      console.error("Background job failed:", error);
    } finally {
      running = false;
    }
  }, EVERY_MINUTE);

  return () => clearInterval(timer);
}
