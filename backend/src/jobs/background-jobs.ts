import { purgeExpiredSessions } from "../lib/auth";
import { purgeExpiredCustomerSessions } from "../lib/customer-auth";
import { eraseExpiredCustomerData } from "../lib/privacy";
import { purgeOldOrderWatches } from "../services/customer-push";
import { cancelUnpaidOrders } from "../services/order-admin-service";
import { purgeOldPasswordResets } from "../routes/admin-password-reset";

const EVERY_MINUTE = 60 * 1000;
const EVERY_HOUR = 60 * EVERY_MINUTE;

// Small jobs that run inside the API process every minute.
// (Fine for one server; if we ever run several servers, move this to a single scheduled task.)
export function startBackgroundJobs(): () => void {
  let running = false;
  let lastRetentionRun = 0;

  const timer = setInterval(async () => {
    if (running) return; // don't start a new round while the previous one is still busy
    running = true;
    try {
      const cancelled = await cancelUnpaidOrders();
      if (cancelled > 0) {
        console.log(`Auto-cancelled ${cancelled} unpaid order(s).`);
      }
      await purgeExpiredSessions();
      await purgeOldPasswordResets();
      await purgeExpiredCustomerSessions();
      // Privacy: once an hour, erase customer details that are past the retention period.
      if (Date.now() - lastRetentionRun >= EVERY_HOUR) {
        lastRetentionRun = Date.now();
        await purgeOldOrderWatches();
        const erased = await eraseExpiredCustomerData();
        if (erased > 0) {
          console.log(`Erased customer details from ${erased} old order(s).`);
        }
      }
    } catch (error) {
      console.error("Background job failed:", error);
    } finally {
      running = false;
    }
  }, EVERY_MINUTE);

  return () => clearInterval(timer);
}
