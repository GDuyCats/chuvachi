"use client";

import { useEffect } from "react";
import type { Locale } from "@/i18n/config";
import { ACCOUNT_CHANGED_EVENT } from "@/lib/account-api";
import { PUSH_CHANGED_EVENT } from "@/lib/customer-push";
import { syncFavorites } from "@/lib/favorites";

// Keeps the hearts in this browser and on the server in step: once per page load, and again
// after signing in or out, or switching notifications on or off. Shows nothing.
export function FavoritesSync({ lang }: { lang: Locale }) {
  useEffect(() => {
    const sync = () => void syncFavorites(lang);
    sync();
    window.addEventListener(ACCOUNT_CHANGED_EVENT, sync);
    window.addEventListener(PUSH_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, sync);
      window.removeEventListener(PUSH_CHANGED_EVENT, sync);
    };
  }, [lang]);
  return null;
}
