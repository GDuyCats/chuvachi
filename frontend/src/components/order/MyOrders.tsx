"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { accountApi, type AccountOrder } from "@/lib/account-api";
import { deviceOrders, forgetOrder, type DeviceOrder } from "@/lib/my-orders";
import { ClaimSection, OrdersSection } from "../account/AccountView";
import { Skeleton, SkeletonGroup } from "../Skeleton";

type Props = {
  lang: Locale;
  labels: Dictionary["myOrders"];
  accountLabels: Dictionary["account"];
  statusLabels: Dictionary["track"]["steps"];
  cancelReasons: Dictionary["cancelReasons"];
};

// "My orders": the account's orders when signed in, the orders placed or looked up on this
// device, and a way to look up any other order by code and phone.
export function MyOrders({ lang, labels, accountLabels, statusLabels, cancelReasons }: Props) {
  // null = still checking; false = not signed in
  const [accountOrders, setAccountOrders] = useState<AccountOrder[] | false | null>(null);
  const [onDevice, setOnDevice] = useState<DeviceOrder[]>([]);

  async function loadAccount() {
    try {
      setAccountOrders(await accountApi.orders(lang));
    } catch {
      setAccountOrders(false);
    }
  }

  useEffect(() => {
    void loadAccount();
    setOnDevice(deviceOrders());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per language
  }, [lang]);

  // Orders already shown from the account are not listed twice.
  const inAccount = new Set(accountOrders ? accountOrders.map((o) => o.code) : []);
  const deviceOnly = onDevice.filter((o) => !inAccount.has(o.code));

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-5xl uppercase leading-none md:text-7xl">{labels.title}</h1>
        <p className="text-muted">{labels.intro}</p>
      </header>

      {accountOrders === null && (
        <SkeletonGroup label={labels.loading} className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </SkeletonGroup>
      )}

      {accountOrders !== null && accountOrders !== false && (
        <>
          <OrdersSection
            lang={lang}
            labels={accountLabels}
            statusLabels={statusLabels}
            cancelReasons={cancelReasons}
            orders={accountOrders}
          />
          <ClaimSection labels={accountLabels} onClaimed={loadAccount} />
        </>
      )}

      {accountOrders === false && (
        <section className="flex flex-col items-start gap-3 border-[1.5px] border-black p-5">
          <p>{labels.signInText}</p>
          <Link
            href={`/${lang}/login?next=${encodeURIComponent(`/${lang}/orders`)}`}
            className="flex min-h-11 items-center bg-black px-6 font-bold text-white"
          >
            {labels.signIn}
          </Link>
        </section>
      )}

      {deviceOnly.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-[28px] uppercase tracking-wide">{labels.deviceTitle}</h2>
            <p className="text-sm text-muted">{labels.deviceHint}</p>
          </div>
          <ul className="flex flex-col gap-2">
            {deviceOnly.map((order) => (
              <li key={order.code} className="flex items-center gap-2 bg-surface">
                <Link
                  href={`/${lang}/track?code=${order.code}`}
                  className="flex min-h-14 flex-1 items-center justify-between gap-3 px-4 hover:bg-[#ececec]"
                >
                  <span className="flex flex-col">
                    <span className="font-bold tracking-[0.06em]">{order.code}</span>
                    <span className="text-xs text-muted">
                      {labels.savedOn.replace(
                        "{date}",
                        new Date(order.savedAt).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-GB"),
                      )}
                    </span>
                  </span>
                  <span className="text-sm font-semibold underline">{labels.open}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    forgetOrder(order.code);
                    setOnDevice(deviceOrders());
                  }}
                  aria-label={labels.forget.replace("{code}", order.code)}
                  className="flex h-14 w-12 items-center justify-center text-muted hover:text-ink"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col items-start gap-3 border-t border-line pt-8">
        <h2 className="font-display text-[28px] uppercase tracking-wide">{labels.trackTitle}</h2>
        <p className="text-sm text-muted">{labels.trackHint}</p>
        <Link href={`/${lang}/track`} className="flex min-h-11 items-center border-[1.5px] border-black px-6 font-bold hover:bg-surface">
          {labels.trackButton}
        </Link>
      </section>
    </div>
  );
}
