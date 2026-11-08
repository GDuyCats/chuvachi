"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { ACCOUNT_CHANGED_EVENT, accountApi, type CustomerNotice } from "@/lib/account-api";

type Labels = Dictionary["bell"];

const CHECK_EVERY_MS = 60 * 1000; // how often the unread number is refreshed while the page is open

function timeAgo(iso: string, lang: Locale, justNow: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return justNow;
  const format = new Intl.RelativeTimeFormat(lang === "vi" ? "vi" : "en", { numeric: "auto" });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return format.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return format.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 30) return format.format(-days, "day");
  return new Date(iso).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-GB");
}

function BellIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3a6 6 0 0 0-6 6v3.8L4.2 16.5h15.6L18 12.8V9a6 6 0 0 0-6-6zM9.5 19.5a2.5 2.5 0 0 0 5 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Bell in the header. Signed-in customers see a number for unread notifications and a list
// (order status changes, answers to their reviews); opening the list marks them as read.
export function NotificationBell({ lang, labels }: { lang: Locale; labels: Labels }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CustomerNotice[] | null>(null);
  const [failed, setFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Who is signed in (changes when they sign in or out in another part of the page).
  useEffect(() => {
    const load = () =>
      accountApi
        .current()
        .then((profile) => setSignedIn(profile !== null))
        .catch(() => setSignedIn(false));
    void load();
    window.addEventListener(ACCOUNT_CHANGED_EVENT, load);
    return () => window.removeEventListener(ACCOUNT_CHANGED_EVENT, load);
  }, []);

  const refreshCount = useCallback(() => {
    accountApi
      .unreadCount()
      .then((result) => setUnread(result.unread))
      .catch(() => undefined);
  }, []);

  // Keep the number fresh: now, every minute while the tab is visible, and when coming back to it.
  useEffect(() => {
    if (!signedIn) {
      setUnread(0);
      return;
    }
    refreshCount();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshCount();
    }, CHECK_EVERY_MS);
    const onFocus = () => refreshCount();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [signedIn, refreshCount]);

  // Close on Escape or a tap outside the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || !signedIn) return;
    setFailed(false);
    try {
      const result = await accountApi.notifications(lang);
      setItems(result.items); // keeps their "unread" look for this time the list is open
      if (result.unread > 0) {
        setUnread(0);
        await accountApi.markNotificationsRead();
      }
    } catch {
      setFailed(true);
    }
  }

  const buttonLabel = unread > 0 ? labels.labelUnread.replace("{count}", String(unread)) : labels.label;

  return (
    // Phones have little room in the header: guests see the bell only on wider screens.
    <div ref={rootRef} className={`relative ${signedIn ? "" : "hidden md:block"}`}>
      <button
        type="button"
        onClick={toggle}
        aria-label={buttonLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative flex h-11 w-11 items-center justify-center text-ink"
      >
        <BellIcon />
        {unread > 0 && (
          <span
            key={unread}
            className="animate-badge-bump absolute right-0 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-black px-1 text-[11px] font-bold text-white"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={labels.title}
          className="fixed inset-x-4 top-20 z-40 flex max-h-[70vh] flex-col border-[1.5px] border-black bg-white shadow-[4px_4px_0_#000] md:absolute md:inset-x-auto md:right-0 md:top-full md:mt-2 md:w-[380px]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <span className="font-bold">{labels.title}</span>
            <button type="button" onClick={() => setOpen(false)} aria-label={labels.close} className="flex h-9 w-9 items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </button>
          </div>

          {signedIn === false ? (
            <div className="flex flex-col gap-3 p-4 text-sm">
              <p>{labels.signInText}</p>
              <Link
                href={`/${lang}/login`}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center justify-center bg-black px-4 font-bold text-white"
              >
                {labels.signIn}
              </Link>
              <p className="text-muted">
                {labels.guestHint}{" "}
                <Link href={`/${lang}/track`} onClick={() => setOpen(false)} className="font-semibold text-ink underline">
                  {labels.trackLink}
                </Link>
                .
              </p>
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {failed && <p className="p-4 text-sm font-semibold">{labels.error}</p>}
                {!failed && items === null && <p className="p-4 text-sm text-muted">{labels.loading}</p>}
                {!failed && items?.length === 0 && <p className="p-4 text-sm text-muted">{labels.empty}</p>}
                {!failed && items && items.length > 0 && (
                  <ul>
                    {items.map((item) => (
                      <li key={item.id} className="border-b border-line last:border-b-0">
                        <Link
                          href={item.url}
                          onClick={() => setOpen(false)}
                          className={`flex gap-3 px-4 py-3 hover:bg-surface ${item.read ? "" : "bg-surface"}`}
                        >
                          <span
                            aria-hidden="true"
                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.read ? "bg-transparent" : "bg-black"}`}
                          />
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className={`text-sm ${item.read ? "font-semibold" : "font-bold"}`}>{item.title}</span>
                            {item.body && <span className="line-clamp-2 text-sm text-muted">{item.body}</span>}
                            <span className="text-xs text-muted">{timeAgo(item.createdAt, lang, labels.justNow)}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Link
                href={`/${lang}/account#notifications`}
                onClick={() => setOpen(false)}
                className="border-t border-line px-4 py-3 text-center text-sm font-semibold underline"
              >
                {labels.settings}
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
