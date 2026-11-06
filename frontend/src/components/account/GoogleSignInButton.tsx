"use client";

import Script from "next/script";
import { useCallback, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";

// Minimal types for Google's sign-in script (https://accounts.google.com/gsi/client).
type GoogleCredentialResponse = { credential?: string };
type GoogleIdApi = {
  initialize(options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    ux_mode?: "popup" | "redirect";
    auto_select?: boolean;
  }): void;
  renderButton(
    element: HTMLElement,
    options: {
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "signup_with" | "continue_with";
      shape?: "rectangular" | "pill";
      width?: number;
      locale?: string;
    },
  ): void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

type Props = {
  lang: Locale;
  mode: "signin" | "signup";
  onCredential: (credential: string) => void;
  notConfiguredText: string;
};

// Google's official "Sign in with Google" button. Google shows its own window for choosing an
// account; our site only receives a signed token that the backend checks.
export function GoogleSignInButton({ lang, mode, onCredential, notConfiguredText }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  const render = useCallback(() => {
    const google = window.google;
    if (!google || !holder.current || !CLIENT_ID) return;
    google.accounts.id.initialize({
      client_id: CLIENT_ID,
      ux_mode: "popup",
      callback: (response) => {
        if (response.credential) onCredential(response.credential);
      },
    });
    holder.current.innerHTML = "";
    google.accounts.id.renderButton(holder.current, {
      theme: "filled_black",
      size: "large",
      shape: "rectangular",
      text: mode === "signup" ? "signup_with" : "continue_with",
      width: Math.min(360, holder.current.clientWidth || 360),
      locale: lang,
    });
    setReady(true);
  }, [lang, mode, onCredential]);

  if (!CLIENT_ID) {
    return <p className="border-[1.5px] border-black p-4 text-sm font-semibold">{notConfiguredText}</p>;
  }

  return (
    <>
      {/* onReady also runs when the page is opened again and the script is already loaded. */}
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={render} />
      <div className="relative min-h-11 w-full max-w-[360px]">
        {!ready && <div aria-hidden="true" className="absolute inset-0 h-11 bg-[#ebebeb] motion-safe:animate-pulse" />}
        <div ref={holder} className="w-full" />
      </div>
    </>
  );
}
