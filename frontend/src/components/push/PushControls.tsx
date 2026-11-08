"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import {
  currentSubscription,
  disablePush,
  enablePush,
  pushStatus,
  pushSupport,
  PushSetupError,
  watchOrder,
} from "@/lib/customer-push";

type Labels = Dictionary["push"];
type State = "checking" | "unsupported" | "needsHomeScreen" | "blocked" | "off" | "on";

function setupErrorText(labels: Labels, error: unknown): { state: State | null; message: string } {
  if (error instanceof PushSetupError) {
    if (error.message === "BLOCKED") return { state: "blocked", message: labels.blocked };
    if (error.message === "DISMISSED") return { state: null, message: labels.dismissed };
    if (error.message === "NOT_CONFIGURED") return { state: null, message: labels.notConfigured };
  }
  return { state: null, message: labels.failed };
}

function Bell() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      <path
        d="M10 2.5a5 5 0 0 0-5 5v3.2L3.5 14h13L15 10.7V7.5a5 5 0 0 0-5-5zM8 16a2 2 0 0 0 4 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Shared look: a bordered box with a bell, a title, a short text and the button or status.
function Box({
  id,
  title,
  text,
  state,
  labels,
  onLabel,
  busy,
  message,
  onTurnOn,
  onTurnOff,
}: {
  id?: string;
  title: string;
  text: string;
  state: State;
  labels: Labels;
  onLabel: string;
  busy: boolean;
  message: string | null;
  onTurnOn: () => void;
  onTurnOff?: () => void;
}) {
  const notice: Partial<Record<State, string>> = {
    checking: labels.checking,
    unsupported: labels.unsupported,
    needsHomeScreen: labels.needsHomeScreen,
    blocked: labels.blocked,
  };
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-3 border-[1.5px] border-black p-5">
      <div className="flex items-start gap-3">
        <Bell />
        <div className="flex flex-col gap-1">
          <h2 className="font-bold">{title}</h2>
          <p className="text-sm text-muted">{text}</p>
        </div>
      </div>
      {notice[state] && <p className="text-sm">{notice[state]}</p>}
      {state === "off" && (
        <button
          type="button"
          onClick={onTurnOn}
          disabled={busy}
          className="min-h-11 self-start bg-black px-5 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? labels.working : labels.turnOn}
        </button>
      )}
      {state === "on" && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold">{onLabel}</span>
          {onTurnOff && (
            <button type="button" onClick={onTurnOff} disabled={busy} className="min-h-9 text-sm underline disabled:opacity-50">
              {labels.turnOff}
            </button>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="text-sm font-semibold">
          {message}
        </p>
      )}
    </section>
  );
}

// Account page: switch notifications on or off for this browser (linked to the account).
export function AccountPushSetting({ lang, labels }: { lang: Locale; labels: Labels }) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      const support = pushSupport();
      if (support !== "supported") {
        setState(support);
        return;
      }
      try {
        const subscription = await currentSubscription();
        if (!subscription) {
          setState("off");
          return;
        }
        const status = await pushStatus(subscription.endpoint);
        setState(status.subscribed && status.account ? "on" : "off");
      } catch {
        setState("off");
      }
    }
    void check();
  }, []);

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      await enablePush(lang); // signed in, so the server links this browser to the account
      setState("on");
    } catch (error) {
      const result = setupErrorText(labels, error);
      if (result.state) setState(result.state);
      setMessage(result.message);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMessage(null);
    try {
      await disablePush();
      setState("off");
    } catch {
      setMessage(labels.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box
      id="notifications"
      title={labels.accountTitle}
      text={labels.accountText}
      state={state}
      labels={labels}
      onLabel={labels.on}
      busy={busy}
      message={message}
      onTurnOn={turnOn}
      onTurnOff={turnOff}
    />
  );
}

// Track order and confirmation pages: follow one order on this browser (works without an account).
export function OrderPushButton({
  lang,
  code,
  phone,
  labels,
}: {
  lang: Locale;
  code: string;
  phone: string | null;
  labels: Labels;
}) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function check() {
      const support = pushSupport();
      if (support !== "supported") {
        if (active) setState(support);
        return;
      }
      try {
        const subscription = await currentSubscription();
        const status = subscription ? await pushStatus(subscription.endpoint, code) : null;
        if (active) setState(status?.subscribed && status.watching ? "on" : "off");
      } catch {
        if (active) setState("off");
      }
    }
    void check();
    return () => {
      active = false;
    };
  }, [code]);

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      const endpoint = await enablePush(lang);
      await watchOrder(endpoint, code, phone);
      setState("on");
    } catch (error) {
      const result = setupErrorText(labels, error);
      if (result.state) setState(result.state);
      setMessage(result.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box
      title={labels.orderTitle}
      text={labels.orderText}
      state={state}
      labels={labels}
      onLabel={labels.orderOn}
      busy={busy}
      message={message}
      onTurnOn={turnOn}
    />
  );
}
