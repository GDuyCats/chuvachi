"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import { ACCOUNT_CHANGED_EVENT, accountApi, type CustomerProfile } from "@/lib/account-api";

type Props = {
  lang: Locale;
  signInLabel: string;
  accountLabel: string;
};

// Person icon in the header: opens the account page when signed in, the sign-in page otherwise.
export function AccountLink({ lang, signInLabel, accountLabel }: Props) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);

  useEffect(() => {
    const load = () =>
      accountApi
        .current()
        .then(setProfile)
        .catch(() => setProfile(null));
    load();
    window.addEventListener(ACCOUNT_CHANGED_EVENT, load);
    return () => window.removeEventListener(ACCOUNT_CHANGED_EVENT, load);
  }, []);

  return (
    <Link
      href={profile ? `/${lang}/account` : `/${lang}/login`}
      aria-label={profile ? accountLabel : signInLabel}
      className="flex h-11 w-11 items-center justify-center text-ink"
    >
      {profile ? (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-[13px] font-bold text-white">
          {profile.name.charAt(0).toUpperCase()}
        </span>
      ) : (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" fill="none" />
          <path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
      )}
    </Link>
  );
}
