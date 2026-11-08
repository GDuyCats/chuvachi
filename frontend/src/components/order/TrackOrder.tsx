"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { formatLongDate, formatSlot } from "@/lib/delivery-time";
import { formatPrice } from "@/lib/format";
import { ApiError, fetchOrder, type OrderLookup, type OrderStatus } from "@/lib/public-api";
import { Skeleton, SkeletonGroup } from "../Skeleton";
import { TURNSTILE_ENABLED, TurnstileWidget } from "./TurnstileWidget";

type Props = {
  lang: Locale;
  labels: Dictionary["track"];
};

const STEPS: Exclude<OrderStatus, "CANCELLED">[] = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED"];

type Result = { kind: "found"; order: OrderLookup } | { kind: "notFound" } | { kind: "error"; code: string };

function formatTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));
}

export function TrackOrder({ lang, labels }: Props) {
  const searchParams = useSearchParams();
  // The confirmation page links here with ?code=... ; the phone number is never put in the URL.
  const [code, setCode] = useState(() => (searchParams.get("code") ?? "").toUpperCase());
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [botToken, setBotToken] = useState<string | null>(null);
  const [botReset, setBotReset] = useState(0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    const cleanPhone = phone.trim();
    if (!cleanCode || !cleanPhone) {
      setResult({ kind: "error", code: "INVALID_LOOKUP" });
      return;
    }
    if (TURNSTILE_ENABLED && !botToken) {
      setResult({ kind: "error", code: "BOT_CHECK_PENDING" });
      return;
    }
    setLoading(true);
    try {
      const order = await fetchOrder(cleanCode, cleanPhone, lang, botToken);
      setResult({ kind: "found", order });
    } catch (error) {
      const errorCode = error instanceof ApiError ? error.code : "UNKNOWN";
      setResult(errorCode === "ORDER_NOT_FOUND" ? { kind: "notFound" } : { kind: "error", code: errorCode });
    } finally {
      setLoading(false);
      setBotReset((n) => n + 1); // each check token works once
    }
  }

  const inputClass = "h-13 border-[1.5px] border-black px-3.5 text-[17px]";

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-semibold">
          {labels.code}
          <input
            required
            maxLength={12}
            autoCapitalize="characters"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={labels.codePlaceholder}
            className={`${inputClass} font-semibold tracking-[0.08em]`}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-semibold">
          {labels.phone}
          <input
            required
            type="tel"
            inputMode="tel"
            maxLength={20}
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={labels.phonePlaceholder}
            className={inputClass}
          />
        </label>
        <TurnstileWidget lang={lang} onToken={setBotToken} resetSignal={botReset} />
        <button
          type="submit"
          disabled={loading}
          className="h-13 bg-black px-8 font-bold text-white hover:bg-[#333333] disabled:opacity-60"
        >
          {loading ? labels.checking : labels.submit}
        </button>
      </form>

      {result?.kind === "notFound" && (
        <div role="alert" className="flex flex-col gap-1.5 border-[1.5px] border-black p-5">
          <span className="font-bold">{labels.notFoundTitle}</span>
          <span className="text-[15px] text-[#333333]">{labels.notFoundText}</span>
        </div>
      )}

      {result?.kind === "error" && (
        <p role="alert" className="border-[1.5px] border-black p-5 font-semibold">
          {labels.errors[result.code as keyof typeof labels.errors] ?? labels.errors.UNKNOWN}
        </p>
      )}

      {loading ? (
        <SkeletonGroup label={labels.checking} className="flex flex-col gap-5 border-t-[1.5px] border-black pt-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-5 gap-2">
            {[0, 1, 2, 3, 4].map((step) => (
              <Skeleton key={step} className="h-2" />
            ))}
          </div>
          <Skeleton className="h-24 w-full" />
        </SkeletonGroup>
      ) : (
        result?.kind === "found" && <OrderDetails lang={lang} labels={labels} order={result.order} />
      )}
    </div>
  );
}

function OrderDetails({ lang, labels, order }: { lang: Locale; labels: Dictionary["track"]; order: OrderLookup }) {
  const status = order.status;
  const cancelled = status === "CANCELLED";
  const doneCount = status === "CANCELLED" ? 0 : STEPS.indexOf(status) + 1;
  const deliveryText =
    order.deliveryType === "ASAP"
      ? labels.deliveryAsap
      : `${formatLongDate(order.deliveryDate, lang)}${order.deliverySlot ? ` · ${formatSlot(order.deliverySlot)}` : ""}`;
  const paymentText =
    order.paymentStatus === "PAID" ? labels.paid : order.paymentStatus === "REFUNDED" ? labels.refunded : labels.unpaid;

  return (
    <div className="flex flex-col gap-7" aria-live="polite">
      <div className="flex flex-wrap items-end justify-between gap-3 border-t-[1.5px] border-black pt-6">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            {labels.orderLabel} {order.code}
          </span>
          <h2 className="font-display text-3xl uppercase md:text-[40px]">{labels.headlines[order.status]}</h2>
          {cancelled && <p className="text-[15px] text-[#333333]">{labels.cancelledText}</p>}
        </div>
        <span className="text-sm text-[#333333]">
          {labels.updated} {formatTime(order.updatedAt, lang)}
        </span>
      </div>

      {!cancelled && (
        <ol aria-label={labels.progressLabel} className="grid grid-cols-5 gap-1.5 md:gap-2">
          {STEPS.map((step, index) => {
            const done = index < doneCount;
            return (
              <li key={step} className="flex flex-col gap-2" aria-current={index === doneCount - 1 ? "step" : undefined}>
                <span className={`h-1.5 ${done ? "bg-black" : "bg-[#d4d4d4]"}`} />
                <span className={`text-xs md:text-sm ${done ? "font-bold text-black" : "text-[#595959]"}`}>
                  {labels.steps[step]}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2 bg-surface p-5">
          <h3 className="text-[13px] font-bold uppercase tracking-widest">{labels.deliveryTitle}</h3>
          <span className="font-semibold">{deliveryText}</span>
          <span className="text-[15px] text-[#333333]">
            {order.deliveryZone} · {order.address}
          </span>
        </div>
        <div className="flex flex-col gap-2 bg-surface p-5">
          <h3 className="text-[13px] font-bold uppercase tracking-widest">{labels.paymentTitle}</h3>
          <span className="font-semibold">{formatPrice(order.total, lang)}</span>
          <span
            className={`self-start px-2 py-1 text-xs font-bold uppercase tracking-wider ${
              order.paymentStatus === "PAID" ? "bg-black text-white" : "border-[1.5px] border-black"
            }`}
          >
            {paymentText}
          </span>
        </div>
      </div>

      <div className="flex flex-col text-[15px]">
        <h3 className="mb-2 text-[13px] font-bold uppercase tracking-widest">{labels.itemsTitle}</h3>
        {order.items.map((item, index) => (
          <div key={index} className="flex justify-between gap-3 border-b border-[#e0e0e0] py-2.5">
            <span>
              {item.name} × {item.quantity}
            </span>
            <span className="whitespace-nowrap">{formatPrice(item.unitPrice * item.quantity, lang)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t-[1.5px] border-black pt-3 text-lg font-bold">
          <span>{labels.total}</span>
          <span>{formatPrice(order.total, lang)}</span>
        </div>
        <span className="mt-2 text-[13px] text-muted">{labels.shippingNote}</span>
      </div>

      <p className="text-sm text-muted">{labels.help}</p>
    </div>
  );
}
