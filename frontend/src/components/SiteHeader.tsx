import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { AccountLink } from "./account/AccountLink";
import { NotificationBell } from "./account/NotificationBell";
import { CartBadge } from "./CartBadge";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { SiteSearch } from "./SiteSearch";
import type { SearchIndex } from "@/lib/search-index";

type Props = {
  lang: Locale;
  dict: Dictionary["nav"];
  searchIndex: SearchIndex;
  searchLabels: Dictionary["search"];
  bellLabels: Dictionary["bell"];
};

export function SiteHeader({ lang, dict, searchIndex, searchLabels, bellLabels }: Props) {
  const links = [
    { href: `/${lang}/menu`, label: dict.menu },
    { href: `/${lang}#new`, label: dict.new },
    { href: `/${lang}#seasonal`, label: dict.seasonal },
    { href: `/${lang}#coming-soon`, label: dict.comingSoon },
    { href: "#contact", label: dict.contact },
  ];

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-4 md:px-10">
      <Link href={`/${lang}`} className="font-display text-2xl tracking-[0.18em] text-black md:text-3xl">
        CHUVACHI
      </Link>

      {/* On phones the menu moves to its own row and scrolls sideways. */}
      <nav
        aria-label={dict.label}
        className="no-scrollbar order-3 flex w-full gap-6 overflow-x-auto whitespace-nowrap text-[15px] font-semibold md:order-none md:w-auto md:gap-9"
      >
        {links.map((link) => (
          <Link key={link.label} href={link.href} className="py-2 hover:text-muted">
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-1.5 md:gap-3">
        <SiteSearch lang={lang} index={searchIndex} labels={searchLabels} />
        <LanguageSwitcher current={lang} label={dict.language} />
        <NotificationBell lang={lang} labels={bellLabels} />
        <AccountLink lang={lang} signInLabel={dict.signIn} accountLabel={dict.account} />
        <Link
          href={`/${lang}/order`}
          aria-label={dict.cart}
          className="relative flex h-11 w-11 items-center justify-center text-ink"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 8h14l-1 12H6z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
            <path d="M9 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
          <CartBadge />
        </Link>
      </div>
    </header>
  );
}
