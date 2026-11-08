"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";
import { useAdminI18n } from "./AdminI18n";
import { requestOpenOrder, useOrderPulse } from "./OrderPulse";

// "2026-11-08" -> "08/11"
function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

// Bell in the top right: the badge counts orders waiting for the payment check;
// tapping it lists them, plus how many orders are still open today and tomorrow.
export function OrderInbox() {
  const { t, lang } = useAdminI18n();
  const box = t.inbox;
  const { pulse } = useOrderPulse();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  const waiting = pulse?.waiting ?? 0;

  // Close when tapping outside or pressing Escape.
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    function onPointer(event: PointerEvent) {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function ago(iso: string): string {
    if (now === null) return "";
    const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
    if (minutes < 60) return box.minutesAgo.replace("{count}", String(minutes));
    return box.hoursAgo.replace("{count}", String(Math.round(minutes / 60)));
  }

  function openOrder(code: string) {
    setOpen(false);
    if (pathname.startsWith("/admin/orders")) {
      requestOpenOrder(code);
    } else {
      router.push(`/admin/orders?open=${encodeURIComponent(code)}`);
    }
  }

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={waiting > 0 ? box.buttonWithCount.replace("{count}", String(waiting)) : box.button}
        className="relative flex h-9 w-9 items-center justify-center border-[1.5px] border-white"
      >
        <BellIcon />
        {waiting > 0 && (
          <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border-[1.5px] border-black bg-white px-1 text-[11px] font-bold leading-none text-black">
            {waiting > 99 ? "99+" : waiting}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={box.title}
          className="absolute right-0 top-11 z-50 flex w-[min(340px,calc(100vw-32px))] flex-col border-[1.5px] border-black bg-white text-black shadow-[4px_4px_0_#000]"
        >
          <div className="flex flex-col gap-1 border-b border-[#e0e0e0] p-4">
            <span className="text-base font-bold">
              {waiting > 0 ? box.waiting.replace("{count}", String(waiting)) : box.noneWaiting}
            </span>
            {waiting > 0 && <span className="text-xs text-muted">{box.waitingHint}</span>}
          </div>

          {pulse && pulse.pending.length > 0 && (
            <ul className="max-h-72 overflow-y-auto">
              {pulse.pending.map((order) => (
                <li key={order.code}>
                  <button
                    type="button"
                    onClick={() => openOrder(order.code)}
                    className="flex w-full flex-col gap-0.5 border-b border-[#eeeeee] px-4 py-3 text-left hover:bg-[#f5f5f5]"
                  >
                    <span className="flex justify-between gap-3">
                      <span className="font-bold tracking-[0.04em]">{order.code}</span>
                      <span className="font-bold">{formatPrice(order.total, lang)}</span>
                    </span>
                    <span className="text-xs text-muted">
                      {box.delivery
                        .replace("{date}", shortDate(order.deliveryDate))
                        .replace("{slot}", order.deliveryType === "ASAP" ? box.asap : (order.deliverySlot ?? ""))}
                      {" · "}
                      {box.portions.replace("{count}", String(order.totalPortions))}
                      {" · "}
                      {ago(order.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-1 p-4 text-sm">
            <span>{box.openToday.replace("{count}", String(pulse?.open.today ?? 0))}</span>
            <span>{box.openTomorrow.replace("{count}", String(pulse?.open.tomorrow ?? 0))}</span>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push("/admin/orders");
              }}
              className="mt-2 min-h-10 bg-black px-4 text-sm font-bold text-white"
            >
              {box.seeAll}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Thin line bell (black and white, no emoji), same style as the other admin icons.
function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z" strokeLinejoin="round" />
      <path d="M10 21h4" strokeLinecap="round" />
    </svg>
  );
}
