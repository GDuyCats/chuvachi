// Push notifications for customers (order status, replies to their reviews) on this browser.
// See backend/src/routes/customer-push.ts.

import type { Locale } from "@/i18n/config";
import { request } from "./public-api";

export type PushSupport = "supported" | "unsupported" | "needsHomeScreen" | "blocked";

// The server's public key comes as base64url text; the browser wants bytes.
function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64url}${"=".repeat((4 - (base64url.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isInstalledApp(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function pushSupport(): PushSupport {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // iPhone only offers push to web apps added to the home screen.
    return isIos() && !isInstalledApp() ? "needsHomeScreen" : "unsupported";
  }
  return Notification.permission === "denied" ? "blocked" : "supported";
}

function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

// This browser's subscription, if notifications were switched on before.
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "supported") return null;
  const reg = await registration();
  return reg.pushManager.getSubscription();
}

export class PushSetupError extends Error {}

// Asks for permission (the browser shows its own prompt) and registers this browser.
// Returns the subscription's endpoint, which identifies this browser to the server.
export async function enablePush(locale: Locale): Promise<string> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new PushSetupError(permission === "denied" ? "BLOCKED" : "DISMISSED");
  const { publicKey } = await request<{ publicKey: string | null }>("/api/push/public-key", { cache: "no-store" });
  if (!publicKey) throw new PushSetupError("NOT_CONFIGURED");
  const reg = await registration();
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
  const json = subscription.toJSON();
  await request<{ ok: true }>("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
      locale,
    }),
  });
  return subscription.endpoint;
}

export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await request<{ ok: true }>("/api/push/unsubscribe", {
    method: "POST",
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await subscription.unsubscribe();
}

// This browser follows one order (proved with its phone number, or by the signed-in owner).
export function watchOrder(endpoint: string, code: string, phone: string | null): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/push/watch-order", {
    method: "POST",
    body: JSON.stringify({ endpoint, code, ...(phone ? { phone } : {}) }),
  });
}

export function pushStatus(endpoint: string, code?: string) {
  return request<{ subscribed: boolean; account: boolean; watching: boolean }>("/api/push/status", {
    method: "POST",
    body: JSON.stringify({ endpoint, ...(code ? { code } : {}) }),
  });
}
