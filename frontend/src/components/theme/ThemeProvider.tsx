"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { THEME_VARIABLES, themeVars, type SiteThemeView } from "@/lib/site-theme";
import { ThemeEffect } from "./ThemeEffect";

const ThemeContext = createContext<SiteThemeView | null>(null);

// The seasonal look showing on this page (null = plain black and white).
export function useSiteTheme(): SiteThemeView | null {
  return useContext(ThemeContext);
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const PREVIEW_KEY = "chuvachi-theme-preview"; // keeps the preview while the admin clicks around the site

function readPreviewId(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get("themePreview");
  try {
    if (fromUrl) sessionStorage.setItem(PREVIEW_KEY, fromUrl);
    return fromUrl ?? sessionStorage.getItem(PREVIEW_KEY);
  } catch {
    return fromUrl; // storage blocked (private window): the preview lasts for this page only
  }
}

type Props = {
  theme: SiteThemeView | null; // the look for everyone, chosen on the server
  lang: Locale;
  labels: { previewing: string; exit: string };
  children: ReactNode;
};

// Shares the look with the top bar, the logo icon and the falling effect. Colors are already on
// <html> from the server; an admin trying a look ("?themePreview=3") gets it here instead,
// fetched with their admin sign-in, so customers never see it.
export function ThemeProvider({ theme, lang, labels, children }: Props) {
  const [preview, setPreview] = useState<SiteThemeView | null>(null);

  useEffect(() => {
    const id = readPreviewId();
    if (!id || !/^\d+$/.test(id)) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/admin/themes/${id}/preview?locale=${lang}`, { credentials: "include" })
      .then((response) => (response.ok ? (response.json() as Promise<SiteThemeView>) : null))
      .then((look) => {
        if (!cancelled && look) setPreview(look);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [lang]);

  // The previewed colors replace the server's ones on <html> while the preview lasts.
  useEffect(() => {
    if (!preview) return;
    const root = document.documentElement;
    const before = THEME_VARIABLES.map((name) => [name, root.style.getPropertyValue(name)] as const);
    THEME_VARIABLES.forEach((name) => root.style.removeProperty(name));
    Object.entries(themeVars(preview.colors)).forEach(([name, value]) => root.style.setProperty(name, value));
    return () => {
      THEME_VARIABLES.forEach((name) => root.style.removeProperty(name));
      before.forEach(([name, value]) => value && root.style.setProperty(name, value));
    };
  }, [preview]);

  function stopPreview() {
    try {
      sessionStorage.removeItem(PREVIEW_KEY);
    } catch {
      // nothing saved
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("themePreview");
    window.location.replace(url.toString());
  }

  const look = preview ?? theme;
  return (
    <ThemeContext.Provider value={look}>
      {children}
      {look?.effect && <ThemeEffect key={look.id} effect={look.effect} lang={lang} colors={look.colors} />}
      {preview && (
        <div
          role="status"
          className="fixed bottom-4 left-4 z-50 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-x-3 gap-y-1 border-[1.5px] border-black bg-white px-4 py-2.5 text-sm text-ink shadow-[4px_4px_0_#000]"
        >
          <span className="font-semibold">{labels.previewing}</span>
          <button type="button" onClick={stopPreview} className="min-h-9 font-bold underline">
            {labels.exit}
          </button>
        </div>
      )}
    </ThemeContext.Provider>
  );
}
