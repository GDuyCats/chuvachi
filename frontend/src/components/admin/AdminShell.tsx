"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { adminApi, AdminApiError, type AdminMe } from "@/lib/admin-api";
import { AdminLanguageSwitch, useAdminI18n } from "./AdminI18n";
import { AdminShellSkeleton } from "./AdminSkeletons";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { AdminSearch } from "./AdminSearch";
import { OrderInbox } from "./OrderInbox";
import { OrderPulseProvider } from "./OrderPulse";
import { NewOrderAlerts } from "./NewOrderAlerts";

const AdminMeContext = createContext<AdminMe | null>(null);

export function useAdminMe(): AdminMe | null {
  return useContext(AdminMeContext);
}

type ShellProps = {
  children: ReactNode;
  adminOnly?: boolean; // page for the ADMIN role only; staff see a short "no access" note instead
};

// Top bar + section tabs for signed-in staff. Sends visitors without a valid session to the login page.
// Someone signed in with a temporary password must set their own password before anything else.
export function AdminShell({ children, adminOnly = false }: ShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useAdminI18n();
  const [me, setMe] = useState<AdminMe | null>(null);

  useEffect(() => {
    adminApi
      .me()
      .then(setMe)
      .catch((error: unknown) => {
        if (error instanceof AdminApiError && error.status === 401) {
          router.replace("/admin/login");
        }
      });
  }, [router]);

  // Ctrl+S (Cmd+S on a Mac) presses the Save button of the form being edited: the one around
  // the cursor, else the first on the page. Never opens the browser's "Save page as".
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      const focused = document.activeElement?.closest("[data-savable]");
      const area = focused ?? document.querySelector("[data-savable]");
      if (!area) return;
      const button = [...area.querySelectorAll<HTMLButtonElement>("[data-save-button]")].find(
        (candidate) => candidate.closest("[data-savable]") === area,
      );
      if (button && !button.disabled) button.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function signOut() {
    try {
      await adminApi.logout();
    } finally {
      router.replace("/admin/login");
    }
  }

  if (!me) {
    return <AdminShellSkeleton />;
  }

  const isAdmin = me.role === "ADMIN";
  // Related pages share one dropdown so the bar stays short. A group with one page left
  // (staff see only "Expenses" under Money) shows as a plain tab.
  const items: NavItem[] = [
    { href: "/admin/orders", label: t.nav.orders, show: true },
    { href: "/admin/products", label: t.nav.products, show: true },
    { href: "/admin/reviews", label: t.nav.reviews, show: true },
    {
      label: t.nav.groupMoney,
      links: [
        { href: "/admin/expenses", label: t.nav.expenses, show: true },
        { href: "/admin/stats", label: t.nav.stats, show: isAdmin },
        { href: "/admin/costing", label: t.nav.costing, show: isAdmin },
      ],
    },
    {
      label: t.nav.groupSite,
      links: [
        { href: "/admin/home", label: t.nav.home, show: isAdmin },
        { href: "/admin/posts", label: t.nav.posts, show: isAdmin },
        { href: "/admin/themes", label: t.nav.themes, show: isAdmin },
      ],
    },
    {
      label: t.nav.groupSystem,
      links: [
        { href: "/admin/settings", label: t.nav.settings, show: isAdmin },
        { href: "/admin/accounts", label: t.nav.accounts, show: isAdmin },
      ],
    },
  ];

  let content: ReactNode = children;
  if (me.mustChangePassword) {
    content = <ChangePasswordForm forced onChanged={setMe} />;
  } else if (adminOnly && !isAdmin) {
    content = (
      <section className="flex max-w-xl flex-col gap-2 border-[1.5px] border-black bg-white p-5">
        <h1 className="font-display text-2xl uppercase tracking-wide">{t.noAccess.title}</h1>
        <p className="text-sm">{t.noAccess.body}</p>
      </section>
    );
  }

  return (
    <AdminMeContext.Provider value={me}>
      <PulseWhenReady ready={!me.mustChangePassword}>
      <div className="min-h-screen bg-[#fafafa]">
        <header className="flex flex-wrap items-center justify-between gap-3 bg-black px-4 py-3.5 text-white md:px-8">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-2xl tracking-[0.18em]">CHUVACHI</span>
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#c7c7c7]">{t.brand}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-[#c7c7c7] sm:inline">
              {t.signedInAs} {me.name} · {t.roles[me.role]}
            </span>
            {!me.mustChangePassword && (
              <>
                <Link href="/admin/notifications" className="py-2 font-semibold underline">
                  {t.nav.notifications}
                </Link>
                <Link href="/admin/password" className="py-2 font-semibold underline">
                  {t.changePassword}
                </Link>
              </>
            )}
            {!me.mustChangePassword && <AdminSearch />}
            {!me.mustChangePassword && <NewOrderAlerts />}
            {!me.mustChangePassword && <OrderInbox />}
            <AdminLanguageSwitch />
            <button type="button" onClick={signOut} className="py-2 font-semibold underline">
              {t.signOut}
            </button>
          </div>
        </header>
        {!me.mustChangePassword && (
          <nav className="no-scrollbar flex gap-7 overflow-x-auto whitespace-nowrap border-b border-[#e0e0e0] bg-white px-4 text-[15px] font-semibold md:px-8">
            {items.map((item) => {
              const links = "links" in item ? item.links.filter((link) => link.show) : item.show ? [item] : [];
              if (links.length === 0) return null;
              if (links.length === 1) {
                const tab = links[0];
                const active = pathname.startsWith(tab.href);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={`shrink-0 border-b-[3px] py-3.5 ${active ? "border-black" : "border-transparent text-muted"}`}
                  >
                    {tab.label}
                  </Link>
                );
              }
              return <NavGroup key={item.label} label={item.label} links={links} pathname={pathname} />;
            })}
          </nav>
        )}
        <main className="px-4 pb-12 pt-6 md:px-8">{content}</main>
      </div>
      </PulseWhenReady>
    </AdminMeContext.Provider>
  );
}

type NavLink = { href: string; label: string; show: boolean };
type NavItem = NavLink | { label: string; links: NavLink[] };

// A tab that opens a small menu of related pages. The menu is placed with fixed coordinates
// because the tab bar scrolls sideways on phones and would cut it off.
function NavGroup({ label, links, pathname }: { label: string; links: NavLink[]; pathname: string }) {
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const current = links.find((link) => pathname.startsWith(link.href));

  useEffect(() => {
    if (!place) return;
    const close = (event: Event) => {
      const target = event.target as Node | null;
      if (event.type === "keydown" ? (event as KeyboardEvent).key === "Escape" : !button.current?.contains(target) && !menu.current?.contains(target)) {
        setPlace(null);
      }
    };
    const closeNow = () => setPlace(null);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("resize", closeNow);
    window.addEventListener("scroll", closeNow, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("resize", closeNow);
      window.removeEventListener("scroll", closeNow, true);
    };
  }, [place]);

  function toggle() {
    if (place) {
      setPlace(null);
      return;
    }
    const box = button.current?.getBoundingClientRect();
    if (box) setPlace({ left: Math.min(box.left, window.innerWidth - 232), top: box.bottom });
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-expanded={place !== null}
        aria-haspopup="menu"
        className={`flex shrink-0 items-center gap-1.5 border-b-[3px] py-3.5 ${current ? "border-black" : "border-transparent text-muted"}`}
      >
        {current ? `${label}: ${current.label}` : label}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={place ? "rotate-180" : ""}>
          <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      {place && (
        <div
          ref={menu}
          role="menu"
          className="fixed z-50 flex w-56 flex-col border-[1.5px] border-black bg-white text-[15px] shadow-[4px_4px_0_#000]"
          style={{ left: Math.max(8, place.left), top: place.top }}
        >
          {links.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                role="menuitem"
                onClick={() => setPlace(null)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center px-4 font-semibold hover:bg-surface ${active ? "bg-black text-white hover:bg-black" : ""}`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

// The order poller only runs once the person may use the admin (not while a new password is required).
function PulseWhenReady({ ready, children }: { ready: boolean; children: ReactNode }) {
  return ready ? <OrderPulseProvider>{children}</OrderPulseProvider> : <>{children}</>;
}
