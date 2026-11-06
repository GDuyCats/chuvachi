"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { adminApi, AdminApiError, type AdminMe } from "@/lib/admin-api";
import { AdminLanguageSwitch, useAdminI18n } from "./AdminI18n";

const AdminMeContext = createContext<AdminMe | null>(null);

export function useAdminMe(): AdminMe | null {
  return useContext(AdminMeContext);
}

// Top bar + section tabs for signed-in staff. Sends visitors without a valid session to the login page.
export function AdminShell({ children }: { children: ReactNode }) {
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

  async function signOut() {
    try {
      await adminApi.logout();
    } finally {
      router.replace("/admin/login");
    }
  }

  if (!me) {
    return <div className="min-h-screen bg-[#fafafa]" />;
  }

  const tabs = [
    { href: "/admin/orders", label: t.nav.orders },
    { href: "/admin/settings", label: t.nav.settings },
  ];

  return (
    <AdminMeContext.Provider value={me}>
      <div className="min-h-screen bg-[#fafafa]">
        <header className="flex flex-wrap items-center justify-between gap-3 bg-black px-4 py-3.5 text-white md:px-8">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-2xl tracking-[0.18em]">CHUVACHI</span>
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#c7c7c7]">{t.brand}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-[#c7c7c7] sm:inline">
              {t.signedInAs} {me.name}
            </span>
            <AdminLanguageSwitch />
            <button type="button" onClick={signOut} className="py-2 font-semibold underline">
              {t.signOut}
            </button>
          </div>
        </header>
        <nav className="no-scrollbar flex gap-7 overflow-x-auto whitespace-nowrap border-b border-[#e0e0e0] bg-white px-4 text-[15px] font-semibold md:px-8">
          {tabs.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`border-b-[3px] py-3.5 ${active ? "border-black" : "border-transparent text-muted"}`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <main className="px-4 pb-12 pt-6 md:px-8">{children}</main>
      </div>
    </AdminMeContext.Provider>
  );
}
