"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { matchScore, queryWords } from "@/lib/search-text";
import { useAdminMe } from "./AdminShell";
import { useAdminI18n } from "./AdminI18n";

// Every place in the admin a person might look for. "target" is the id of the part of the page
// to scroll to and highlight. Admin-only places are hidden from staff.
const PLACES = [
  { key: "orders", href: "/admin/orders", adminOnly: false },
  { key: "ordersAll", href: "/admin/orders/all", adminOnly: false },
  { key: "ordersBulk", href: "/admin/orders", target: "orders-bulk-button", adminOnly: false },
  { key: "refund", href: "/admin/orders", adminOnly: false },
  { key: "products", href: "/admin/products", adminOnly: false },
  { key: "stock", href: "/admin/products", adminOnly: false },
  { key: "reviews", href: "/admin/reviews", adminOnly: false },
  { key: "expenses", href: "/admin/expenses", adminOnly: false },
  { key: "profit", href: "/admin/stats", adminOnly: true },
  { key: "pushAlerts", href: "/admin/notifications", target: "notifications-push", adminOnly: false },
  { key: "emailAlerts", href: "/admin/notifications", target: "notifications-email", adminOnly: false },
  { key: "password", href: "/admin/password", adminOnly: false },
  { key: "productNew", href: "/admin/products/edit", adminOnly: true },
  { key: "photos", href: "/admin/products", adminOnly: true },
  { key: "categories", href: "/admin/products", target: "products-categories", adminOnly: true },
  { key: "stats", href: "/admin/stats", adminOnly: true },
  { key: "announcement", href: "/admin/home", target: "home-announcement", adminOnly: true },
  { key: "hero", href: "/admin/home", target: "home-hero", adminOnly: true },
  { key: "heroSlides", href: "/admin/home", target: "home-slides", adminOnly: true },
  { key: "posts", href: "/admin/posts", adminOnly: true },
  { key: "seasons", href: "/admin/home", target: "home-seasons", adminOnly: true },
  { key: "comingSoon", href: "/admin/home", target: "home-coming-soon", adminOnly: true },
  { key: "bank", href: "/admin/settings", target: "settings-bank", adminOnly: true },
  { key: "contact", href: "/admin/settings", target: "settings-contact", adminOnly: true },
  { key: "pause", href: "/admin/settings", target: "settings-pause", adminOnly: true },
  { key: "sold", href: "/admin/settings", target: "settings-sold", adminOnly: true },
  { key: "business", href: "/admin/settings", target: "settings-business", adminOnly: true },
  { key: "rules", href: "/admin/settings", target: "settings-rules", adminOnly: true },
  { key: "reviewRules", href: "/admin/settings", target: "settings-reviews", adminOnly: true },
  { key: "zones", href: "/admin/settings", target: "settings-zones", adminOnly: true },
  { key: "capacity", href: "/admin/settings", target: "settings-capacity", adminOnly: true },
  { key: "telegram", href: "/admin/settings", target: "settings-telegram", adminOnly: true },
  { key: "accounts", href: "/admin/accounts", adminOnly: true },
  { key: "accountCreate", href: "/admin/accounts", target: "accounts-create", adminOnly: true },
  { key: "resetPassword", href: "/admin/accounts", adminOnly: true },
  { key: "eraseCustomer", href: "/admin/orders", adminOnly: true },
] as const;

type Place = (typeof PLACES)[number];

// Waits (up to 6 seconds, while the page loads its data) for the part of the page, then scrolls to it
// and outlines it for a moment.
function scrollToTarget(id: string) {
  const started = Date.now();
  const timer = window.setInterval(() => {
    const element = document.getElementById(id);
    if (element) {
      window.clearInterval(timer);
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      element.classList.add("outline", "outline-2", "outline-offset-4", "outline-black");
      window.setTimeout(() => element.classList.remove("outline", "outline-2", "outline-offset-4", "outline-black"), 2000);
    } else if (Date.now() - started > 6000) {
      window.clearInterval(timer);
    }
  }, 150);
}

// "Find a setting" box in the admin's black bar (also opened with Ctrl+K).
export function AdminSearch() {
  const { t } = useAdminI18n();
  const s = t.adminSearch;
  const me = useAdminMe();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      window.setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  const pageName: Record<string, string> = {
    "/admin/orders": t.nav.orders,
    "/admin/orders/all": t.orders.history.title,
    "/admin/products": t.nav.products,
    "/admin/products/edit": t.nav.products,
    "/admin/stats": t.nav.stats,
    "/admin/reviews": t.nav.reviews,
    "/admin/expenses": t.nav.expenses,
    "/admin/home": t.nav.home,
    "/admin/posts": t.nav.posts,
    "/admin/settings": t.nav.settings,
    "/admin/accounts": t.nav.accounts,
    "/admin/notifications": t.nav.notifications,
    "/admin/password": t.changePassword,
  };

  const results = useMemo(() => {
    const allowed = PLACES.filter((place) => !place.adminOnly || me?.role === "ADMIN");
    const words = queryWords(query);
    if (words.length === 0) return allowed;
    return allowed
      .map((place) => {
        const item = s.items[place.key];
        return { place, score: matchScore(words, [item.label, item.keywords, pageName[place.href]]) };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((row) => row.place);
    // pageName only changes with the language, which also changes "s".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, me?.role, s]);

  function go(place: Place) {
    setOpen(false);
    if (pathname !== place.href) router.push(place.href);
    if ("target" in place) scrollToTarget(place.target);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={s.open}
        className="flex min-h-9 items-center gap-2 border-[1.5px] border-white px-2.5 text-[13px] font-semibold"
      >
        <SearchIcon />
        <span className="hidden md:inline">{s.open}</span>
        <kbd className="hidden border border-[#777777] px-1 text-[11px] font-normal text-[#c7c7c7] lg:inline">Ctrl K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40 text-black" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={s.open}
            onClick={(event) => event.stopPropagation()}
            className="mx-auto flex max-h-full w-full max-w-xl flex-col bg-white md:mt-20 md:max-h-[70vh] md:border-[1.5px] md:border-black"
          >
            <div className="flex items-center gap-2 border-b-[1.5px] border-black px-4">
              <SearchIcon />
              <input
                ref={input}
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActive((i) => Math.min(i + 1, results.length - 1));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActive((i) => Math.max(i - 1, 0));
                  } else if (event.key === "Enter" && results[active]) {
                    event.preventDefault();
                    go(results[active]);
                  }
                }}
                placeholder={s.placeholder}
                aria-label={s.placeholder}
                className="h-14 min-w-0 flex-1 appearance-none bg-transparent text-base outline-none focus-visible:outline-none"
              />
              <button type="button" onClick={() => setOpen(false)} className="py-2 text-sm font-semibold underline">
                {s.close}
              </button>
            </div>
            <ul className="overflow-y-auto py-2">
              {results.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">{s.nothing}</li>}
              {results.map((place, index) => {
                const item = s.items[place.key];
                return (
                  <li key={place.key}>
                    <button
                      type="button"
                      onClick={() => go(place)}
                      onMouseEnter={() => setActive(index)}
                      className={`flex w-full flex-col gap-0.5 px-4 py-2.5 text-left ${index === active ? "bg-black text-white" : ""}`}
                    >
                      <span className="font-semibold">{item.label}</span>
                      <span className={`text-xs ${index === active ? "text-[#d4d4d4]" : "text-muted"}`}>
                        {pageName[place.href]}
                        {"hint" in item && item.hint ? ` · ${item.hint}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" strokeLinecap="round" />
    </svg>
  );
}
