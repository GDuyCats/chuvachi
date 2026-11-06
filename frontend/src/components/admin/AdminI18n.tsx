"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { localeCookieName, type Locale } from "@/i18n/config";
import en from "@/i18n/admin/en.json";
import vi from "@/i18n/admin/vi.json";

export type AdminDictionary = typeof en;

const dictionaries: Record<Locale, AdminDictionary> = { en, vi };

type AdminI18nValue = {
  lang: Locale;
  t: AdminDictionary;
  setLang: (lang: Locale) => void;
};

const AdminI18nContext = createContext<AdminI18nValue | null>(null);

function readSavedLocale(): Locale {
  const match = document.cookie.match(new RegExp(`(?:^|; )${localeCookieName}=(vi|en)`));
  return match?.[1] === "en" ? "en" : "vi";
}

// Language for the admin pages. Shares the VI / EN choice with the shop pages (same cookie).
export function AdminI18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Locale>("vi");

  useEffect(() => {
    setLangState(readSavedLocale());
  }, []);

  function setLang(next: Locale) {
    document.cookie = `${localeCookieName}=${next}; path=/; max-age=31536000; samesite=lax`;
    setLangState(next);
  }

  return (
    <AdminI18nContext.Provider value={{ lang, t: dictionaries[lang], setLang }}>{children}</AdminI18nContext.Provider>
  );
}

export function useAdminI18n(): AdminI18nValue {
  const value = useContext(AdminI18nContext);
  if (!value) {
    throw new Error("useAdminI18n must be used inside AdminI18nProvider");
  }
  return value;
}

export function AdminLanguageSwitch() {
  const { lang, setLang, t } = useAdminI18n();
  return (
    <div role="group" aria-label={t.language} className="flex border-[1.5px] border-white text-[13px] font-bold">
      {(["vi", "en"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === lang}
          onClick={() => setLang(option)}
          className={`min-h-9 px-2.5 ${option === lang ? "bg-white text-black" : "text-white"}`}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
