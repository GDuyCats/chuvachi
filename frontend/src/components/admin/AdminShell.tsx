"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { adminApi, AdminApiError, type AdminMe } from "@/lib/admin-api";
import { AdminLanguageSwitch, useAdminI18n } from "./AdminI18n";
import { AdminShellSkeleton } from "./AdminSkeletons";
import { ChangePasswordForm } from "./ChangePasswordForm";
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
  const tabs = [
    { href: "/admin/orders", label: t.nav.orders, show: true },
    { href: "/admin/products", label: t.nav.products, show: true },
    { href: "/admin/home", label: t.nav.home, show: isAdmin },
    { href: "/admin/settings", label: t.nav.settings, show: isAdmin },
    { href: "/admin/accounts", label: t.nav.accounts, show: isAdmin },
  ].filter((tab) => tab.show);

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
              <Link href="/admin/password" className="py-2 font-semibold underline">
                {t.changePassword}
              </Link>
            )}
            {!me.mustChangePassword && <NewOrderAlerts />}
            <AdminLanguageSwitch />
            <button type="button" onClick={signOut} className="py-2 font-semibold underline">
              {t.signOut}
            </button>
          </div>
        </header>
        {!me.mustChangePassword && (
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
        )}
        <main className="px-4 pb-12 pt-6 md:px-8">{content}</main>
      </div>
    </AdminMeContext.Provider>
  );
}
