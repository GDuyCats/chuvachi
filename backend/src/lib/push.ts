import webpush from "web-push";
import { prisma } from "./prisma";

// Web push notifications to staff phones and computers (even when the admin page is closed).
// Needs VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT in the backend .env;
// create the keys once with: npx web-push generate-vapid-keys

export type PushMessage = {
  title: string;
  body: string;
  url: string; // page to open when the notification is tapped
  tag?: string; // a newer message with the same tag replaces the older one
};

let configured: boolean | null = null;

export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    console.warn("Push notifications off: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY or VAPID_SUBJECT is missing.");
    configured = false;
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

// Only real browser push services, so the server can't be tricked into calling other addresses.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /\.notify\.windows\.com$/];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.some((pattern) => pattern.test(url.hostname));
  } catch {
    return false;
  }
}

// Sends to every device of the given accounts (default: every active account).
export async function sendPush(message: PushMessage, adminUserIds?: number[]): Promise<number> {
  if (!ensureConfigured()) return 0;
  const subscriptions = await prisma.adminPushSubscription.findMany({
    where: { adminUser: { isActive: true }, ...(adminUserIds ? { adminUserId: { in: adminUserIds } } : {}) },
  });

  const results = await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify(message),
          { TTL: 60 * 60, urgency: "high" },
        );
        return true;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // The browser dropped this subscription (app removed, permission revoked): forget it.
          await prisma.adminPushSubscription.deleteMany({ where: { id: subscription.id } });
        } else {
          console.error(`Push to subscription ${subscription.id} failed:`, status ?? (error instanceof Error ? error.message : error));
        }
        return false;
      }
    }),
  );
  return results.filter(Boolean).length;
}
