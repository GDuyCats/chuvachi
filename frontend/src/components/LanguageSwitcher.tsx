"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { localeCookieName, locales, type Locale } from "@/i18n/config";

type Props = {
  current: Locale;
  label: string;
};

// Swaps the language part of the current URL, e.g. /vi/menu -> /en/menu.
function pathForLocale(pathname: string, locale: Locale): string {
  const segments = pathname.split("/");
  segments[1] = locale;
  return segments.join("/") || `/${locale}`;
}

function rememberLocale(locale: Locale) {
  // Keep the choice for one year so the next visit opens in the same language.
  document.cookie = `${localeCookieName}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

// The current address is only known in the browser for some pages (for example the "not found"
// page), so the switcher waits for it inside Suspense. Until then the buttons simply lead to the
// homepage in each language.
export function LanguageSwitcher(props: Props) {
  return (
    <Suspense fallback={<Buttons {...props} hrefFor={(locale) => `/${locale}`} />}>
      <SwitcherForCurrentPage {...props} />
    </Suspense>
  );
}

function SwitcherForCurrentPage(props: Props) {
  const pathname = usePathname();
  return <Buttons {...props} hrefFor={(locale) => pathForLocale(pathname, locale)} />;
}

function Buttons({ current, label, hrefFor }: Props & { hrefFor: (locale: Locale) => string }) {
  return (
    <div role="group" aria-label={label} className="flex border-[1.5px] border-black text-[13px] font-bold">
      {locales.map((locale) => {
        const active = locale === current;
        return (
          <Link
            key={locale}
            href={hrefFor(locale)}
            onClick={() => rememberLocale(locale)}
            aria-current={active ? "true" : undefined}
            className={`flex min-h-10 items-center px-3 ${active ? "bg-black text-white" : "bg-white text-black"}`}
          >
            {locale.toUpperCase()}
          </Link>
        );
      })}
    </div>
  );
}
