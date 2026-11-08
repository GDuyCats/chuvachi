"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";
import type { Locale } from "@/i18n/config";

// Minimal types for Cloudflare's Turnstile script.
type TurnstileApi = {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      appearance?: "always" | "execute" | "interaction-only";
      theme?: "light" | "dark" | "auto";
      language?: string;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const TURNSTILE_ENABLED = TURNSTILE_SITE_KEY !== "";

type Props = {
  lang: Locale;
  onToken: (token: string | null) => void;
  resetSignal: number; // change this number to get a fresh token (each token works only once)
};

// Cloudflare's bot check. It stays invisible for most visitors and only shows a small box
// when Cloudflare wants the visitor to tick it.
export function TurnstileWidget({ lang, onToken, resetSignal }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const render = useCallback(() => {
    const turnstile = window.turnstile;
    if (!turnstile || !holder.current || widgetId.current) return;
    widgetId.current = turnstile.render(holder.current, {
      sitekey: TURNSTILE_SITE_KEY,
      appearance: "interaction-only",
      theme: "light",
      language: lang,
      callback: (token) => onTokenRef.current(token),
      "expired-callback": () => onTokenRef.current(null),
      "error-callback": () => onTokenRef.current(null),
    });
  }, [lang]);

  // A new number means the last token was used: ask for a fresh one.
  useEffect(() => {
    if (resetSignal > 0 && widgetId.current && window.turnstile) {
      onTokenRef.current(null);
      window.turnstile.reset(widgetId.current);
    }
  }, [resetSignal]);

  useEffect(
    () => () => {
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    },
    [],
  );

  if (!TURNSTILE_ENABLED) return null;

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={render} />
      <div ref={holder} />
    </>
  );
}
