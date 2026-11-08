"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { useAdminMe } from "./AdminShell";
import { useAdminI18n } from "./AdminI18n";
import { useToast } from "./Toast";

type PushState = "checking" | "unsupported" | "needsHomeScreen" | "blocked" | "off" | "on";

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

async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/admin/sw.js", { scope: "/admin/" });
}

// Each person chooses how they hear about new orders: push on this device, and/or email.
export function NotificationsPage() {
  const { t } = useAdminI18n();
  const n = t.notifications;
  const toast = useToast();
  const me = useAdminMe();
  const [push, setPush] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  const [emailOn, setEmailOn] = useState(me?.notifyNewOrders ?? true);

  useEffect(() => {
    async function check() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // iPhone only offers push to web apps added to the home screen.
        setPush(isIos() && !isInstalledApp() ? "needsHomeScreen" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setPush("blocked");
        return;
      }
      try {
        const reg = await registration();
        const existing = await reg.pushManager.getSubscription();
        setPush(existing ? "on" : "off");
      } catch {
        setPush("unsupported");
      }
    }
    void check();
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPush(permission === "denied" ? "blocked" : "off");
        return;
      }
      const { publicKey } = await adminApi.pushPublicKey();
      if (!publicKey) {
        toast.error(n.push.notConfigured);
        return;
      }
      const reg = await registration();
      const subscription =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
      const json = subscription.toJSON();
      await adminApi.pushSubscribe({
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
      });
      setPush("on");
      toast.success(n.push.turnedOn);
    } catch {
      toast.error(n.push.failed);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await registration();
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        await adminApi.pushUnsubscribe(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setPush("off");
      toast.success(n.push.turnedOff);
    } catch {
      toast.error(n.push.failed);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const { sent } = await adminApi.pushTest();
      if (sent > 0) toast.success(n.push.testSent);
      else toast.error(n.push.testNone);
    } catch {
      toast.error(n.push.failed);
    } finally {
      setBusy(false);
    }
  }

  async function toggleEmail(next: boolean) {
    setBusy(true);
    try {
      await adminApi.setNotifyNewOrders(next);
      setEmailOn(next);
      toast.success(next ? n.email.turnedOn : n.email.turnedOff);
    } catch {
      toast.error(n.push.failed);
    } finally {
      setBusy(false);
    }
  }

  const button = "min-h-11 border-[1.5px] border-black px-4 text-sm font-bold disabled:opacity-50";
  const pushText: Record<PushState, string> = {
    checking: n.push.checking,
    unsupported: n.push.unsupported,
    needsHomeScreen: n.push.needsHomeScreen,
    blocked: n.push.blocked,
    off: n.push.off,
    on: n.push.on,
  };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl uppercase md:text-[40px]">{n.title}</h1>
        <p className="text-sm text-muted">{n.hint}</p>
      </div>

      <section className="flex flex-col gap-3 border border-[#e0e0e0] bg-white p-5">
        <h2 className="font-display text-2xl uppercase tracking-wide">{n.push.title}</h2>
        <p className="text-sm">{n.push.hint}</p>
        <p className={`border-[1.5px] p-3 text-sm font-semibold ${push === "on" ? "border-black bg-black text-white" : "border-black"}`}>
          {pushText[push]}
        </p>
        {push === "needsHomeScreen" && (
          <ol className="list-decimal pl-5 text-sm">
            {n.push.iosSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        )}
        <div className="flex flex-wrap gap-2">
          {push === "off" && (
            <button type="button" disabled={busy} onClick={turnOn} className={`${button} bg-black text-white`}>
              {n.push.turnOn}
            </button>
          )}
          {push === "on" && (
            <>
              <button type="button" disabled={busy} onClick={sendTest} className={`${button} bg-black text-white`}>
                {n.push.test}
              </button>
              <button type="button" disabled={busy} onClick={turnOff} className={button}>
                {n.push.turnOff}
              </button>
            </>
          )}
        </div>
        <p className="text-xs text-muted">{n.push.perDevice}</p>
      </section>

      <section className="flex flex-col gap-3 border border-[#e0e0e0] bg-white p-5">
        <h2 className="font-display text-2xl uppercase tracking-wide">{n.email.title}</h2>
        <p className="text-sm">{n.email.hint.replace("{email}", me?.email ?? "")}</p>
        <label
          className={`flex min-h-12 items-center gap-3 border-[1.5px] px-4 font-bold ${emailOn ? "border-black bg-black text-white" : "border-black"}`}
        >
          <input
            type="checkbox"
            checked={emailOn}
            disabled={busy}
            onChange={(e) => void toggleEmail(e.target.checked)}
            className="h-5 w-5 accent-white"
          />
          {emailOn ? n.email.on : n.email.off}
        </label>
        <p className="text-xs text-muted">{n.email.gmailTip}</p>
      </section>

      <section className="flex flex-col gap-2 border border-[#e0e0e0] bg-white p-5">
        <h2 className="font-display text-2xl uppercase tracking-wide">{n.sound.title}</h2>
        <p className="text-sm">{n.sound.hint}</p>
      </section>
    </div>
  );
}
