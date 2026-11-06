"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { accountApi } from "@/lib/account-api";
import { ApiError } from "@/lib/public-api";
import { GoogleSignInButton } from "./GoogleSignInButton";

type Props = {
  lang: Locale;
  mode: "signin" | "signup";
  labels: Dictionary["account"];
};

// Only our own pages are allowed as the place to return to (no links to other sites).
function safeNext(value: string | null, lang: Locale): string {
  if (value && value.startsWith(`/${lang}/`) && !value.startsWith("//") && !value.includes("\\")) {
    return value;
  }
  return `/${lang}/account`;
}

export function SignInPanel({ lang, mode, labels }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"), lang);
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Already signed in: go straight on.
  useEffect(() => {
    accountApi
      .current()
      .then((profile) => {
        if (profile) router.replace(next);
      })
      .catch(() => {});
  }, [router, next]);

  const handleCredential = useCallback(
    async (credential: string) => {
      setBusy(true);
      setErrorCode(null);
      try {
        await accountApi.signInWithGoogle(credential);
        router.replace(next);
      } catch (error) {
        setErrorCode(error instanceof ApiError ? error.code : "UNKNOWN");
        setBusy(false);
      }
    },
    [router, next],
  );

  const isSignup = mode === "signup";
  const switchHref = `/${lang}/${isSignup ? "login" : "signup"}${searchParams.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-5xl uppercase leading-none md:text-7xl">{isSignup ? labels.signupTitle : labels.signinTitle}</h1>
        <p className="text-[17px] text-[#333333]">{isSignup ? labels.signupIntro : labels.signinIntro}</p>
      </div>

      <ul className="flex flex-col gap-2.5 border-y border-line py-5 text-[15px]">
        {labels.benefits.map((benefit) => (
          <li key={benefit} className="flex gap-3">
            <span aria-hidden="true" className="font-bold">
              ✓
            </span>
            {benefit}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3" aria-busy={busy}>
        <GoogleSignInButton
          lang={lang}
          mode={mode}
          onCredential={handleCredential}
          notConfiguredText={labels.notConfigured}
        />
        {busy && <p role="status" className="text-sm font-semibold">{labels.signingIn}</p>}
        {errorCode && (
          <p role="alert" className="animate-pop-in border-[1.5px] border-black p-3.5 text-sm font-semibold">
            {labels.errors[errorCode as keyof typeof labels.errors] ?? labels.errors.UNKNOWN}
          </p>
        )}
        <p className="text-[13px] leading-relaxed text-muted">
          {labels.googleNote}{" "}
          <Link href={`/${lang}/privacy`} className="underline">
            {labels.privacyLink}
          </Link>
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-5 text-[15px]">
        <span>
          {isSignup ? labels.haveAccount : labels.noAccount}{" "}
          <Link href={switchHref} className="font-semibold underline">
            {isSignup ? labels.signinLink : labels.signupLink}
          </Link>
        </span>
        <Link href={`/${lang}/menu`} className="self-start text-muted underline hover:text-ink">
          {labels.guestLink}
        </Link>
      </div>
    </div>
  );
}
