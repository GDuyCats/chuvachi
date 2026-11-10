"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import {
  clearCart,
  getCartSnapshot,
  getServerCartSnapshot,
  MAX_LINE_QUANTITY,
  removeLine,
  removeLines,
  setLineQuantity,
  subscribeToCart,
  type CartLine,
} from "@/lib/cart";
import { deliveryDays, formatDay, formatSlot, slotStartMs } from "@/lib/delivery-time";
import { formatPrice } from "@/lib/format";
import { saveLastOrder } from "@/lib/last-order";
import { portionsPerUnit, unitPrice } from "@/lib/pricing";
import {
  ApiError,
  fetchOrderSettings,
  placeOrder,
  type DeliveryType,
  type OrderSettings,
} from "@/lib/public-api";
import { accountApi, type CustomerProfile } from "@/lib/account-api";
import { PhotoBox } from "../PhotoBox";
import { QuantityInput } from "../QuantityInput";
import { rememberOrder } from "@/lib/my-orders";
import { TURNSTILE_ENABLED, TurnstileWidget } from "./TurnstileWidget";
import { CheckoutSkeleton, Skeleton } from "../Skeleton";

export type CatalogOption = { id: number; type: "FLAVOR" | "PACKAGE"; name: string; priceDelta: number; portions: number };
export type CatalogProduct = {
  slug: string;
  name: string;
  imageUrl: string | null;
  basePrice: number;
  options: CatalogOption[];
};

type Props = {
  lang: Locale;
  catalog: CatalogProduct[];
  labels: Dictionary["order"];
  photoComingSoon: string;
};

type ResolvedLine = {
  index: number;
  line: CartLine;
  name: string;
  detail: string;
  imageUrl: string | null;
  unitPrice: number;
  portions: number;
};

const HOUR_MS = 60 * 60 * 1000;
const subscribeNothing = () => () => {};

// Matches a cart line with today's menu. Returns null if the cake or one of its options is gone.
function resolveLine(line: CartLine, index: number, catalog: Map<string, CatalogProduct>): ResolvedLine | null {
  const product = catalog.get(line.productSlug);
  if (!product) return null;
  const flavors = product.options.filter((o) => o.type === "FLAVOR");
  const packages = product.options.filter((o) => o.type === "PACKAGE");
  const pack = packages.find((o) => o.id === line.packageOptionId) ?? null;
  if (packages.length > 0 && !pack) return null;

  // Mixed box: "Mango ×2, Strawberry ×4"; every flavor must still be on the menu.
  if (line.flavorMix && line.flavorMix.length > 0) {
    const parts = line.flavorMix.map((part) => ({ part, option: flavors.find((o) => o.id === part.optionId) ?? null }));
    if (parts.some((p) => p.option === null)) return null;
    const extras = parts.reduce((sum, p) => sum + (p.option?.priceDelta ?? 0) * p.part.portions, 0);
    return {
      index,
      line,
      name: product.name,
      detail: [parts.map((p) => `${p.option?.name} ×${p.part.portions}`).join(", "), pack?.name].filter(Boolean).join(" · "),
      imageUrl: product.imageUrl,
      unitPrice: unitPrice(product.basePrice, null, pack) + extras,
      portions: portionsPerUnit(pack),
    };
  }

  const flavor = flavors.find((o) => o.id === line.flavorOptionId) ?? null;
  if (flavors.length > 0 && !flavor) return null;
  return {
    index,
    line,
    name: product.name,
    detail: [flavor?.name, pack?.name].filter(Boolean).join(" · "),
    imageUrl: product.imageUrl,
    unitPrice: unitPrice(product.basePrice, flavor, pack),
    portions: portionsPerUnit(pack),
  };
}

export function CheckoutForm({ lang, catalog, labels, photoComingSoon }: Props) {
  const router = useRouter();
  const isClient = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const cart = useSyncExternalStore(subscribeToCart, getCartSnapshot, getServerCartSnapshot);

  const catalogBySlug = useMemo(() => new Map(catalog.map((p) => [p.slug, p])), [catalog]);
  const resolved = cart.map((line, index) => resolveLine(line, index, catalogBySlug));
  const lines = resolved.filter((l): l is ResolvedLine => l !== null);
  const hasUnavailable = resolved.some((l) => l === null);

  const total = lines.reduce((sum, l) => sum + l.unitPrice * l.line.quantity, 0);
  const totalPortions = lines.reduce((sum, l) => sum + l.portions * l.line.quantity, 0);

  // Remove cakes that are no longer sold, and tell the visitor.
  const [showUnavailableNote, setShowUnavailableNote] = useState(false);
  useEffect(() => {
    if (hasUnavailable) {
      removeLines((line) => resolveLine(line, 0, catalogBySlug) === null);
      setShowUnavailableNote(true);
    }
  }, [hasUnavailable, catalogBySlug]);

  // Delivery rules come from the server (its clock and the shop settings).
  const [settings, setSettings] = useState<OrderSettings | null>(null);
  const [settingsFailed, setSettingsFailed] = useState(false);
  // Current time from the server's clock (not the visitor's device), moved forward every minute.
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    fetchOrderSettings(lang)
      .then((data) => {
        setSettings(data);
        setNowMs(Date.parse(data.now));
      })
      .catch(() => setSettingsFailed(true));
    const timer = window.setInterval(() => setNowMs((ms) => (ms > 0 ? ms + 60_000 : ms)), 60_000);
    return () => window.clearInterval(timer);
  }, [lang]);

  // Form fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [chosenType, setChosenType] = useState<DeliveryType | null>(null);
  const [chosenDate, setChosenDate] = useState<string | null>(null);
  const [chosenSlot, setChosenSlot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false); // never ticked in advance (privacy law)
  const [botToken, setBotToken] = useState<string | null>(null);
  const [botReset, setBotReset] = useState(0);

  // Signed-in customers get their saved details filled in (only into empty fields).
  const [account, setAccount] = useState<CustomerProfile | null>(null);
  useEffect(() => {
    accountApi
      .current()
      .then((profile) => {
        if (!profile) return;
        setAccount(profile);
        setName((current) => current || profile.name);
        setPhone((current) => current || profile.phone || "");
        setAddress((current) => current || profile.defaultAddress || "");
        setZoneId((current) => current || (profile.defaultZoneId ? String(profile.defaultZoneId) : ""));
      })
      .catch(() => setAccount(null));
  }, []);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorProduct, setErrorProduct] = useState("");

  const maxQuantity = settings?.maxQuantityPerItem ?? MAX_LINE_QUANTITY;
  const isLargeOrder = settings ? totalPortions >= settings.largeOrderThreshold : false;
  const leadHours = settings ? (isLargeOrder ? settings.largeOrderLeadHours : settings.smallOrderLeadHours) : 0;
  const asapAllowed = Boolean(settings?.asapAvailable) && !isLargeOrder;
  // "As soon as possible" is the default when it's allowed; otherwise the order must be scheduled.
  const deliveryType: DeliveryType = asapAllowed ? (chosenType ?? "ASAP") : "SCHEDULED";

  const days = settings ? deliveryDays(settings.today, settings.maxDaysAhead, settings.closedWeekdays) : [];
  const earliestMs = nowMs + leadHours * HOUR_MS;
  const openSlots = (date: string) =>
    settings ? settings.deliverySlots.filter((slot) => slotStartMs(date, slot) >= earliestMs) : [];
  const date = chosenDate && days.includes(chosenDate) ? chosenDate : (days.find((d) => openSlots(d).length > 0) ?? null);
  const slotsForDate = date && settings ? settings.deliverySlots : [];
  const availableSlots = date ? openSlots(date) : [];
  const slot = chosenSlot && availableSlots.includes(chosenSlot) ? chosenSlot : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings || lines.length === 0 || submitting) return;
    if (deliveryType === "SCHEDULED" && (!date || !slot)) {
      setErrorCode(!date ? "INVALID_DATE" : "INVALID_SLOT");
      return;
    }

    if (TURNSTILE_ENABLED && !botToken) {
      setErrorCode("BOT_CHECK_PENDING");
      return;
    }

    setSubmitting(true);
    setErrorCode(null);
    try {
      const result = await placeOrder({
        customerName: name.trim(),
        customerPhone: phone.trim(),
        address: address.trim(),
        note: note.trim() || undefined,
        deliveryZoneId: Number(zoneId),
        deliveryType,
        deliveryDate: deliveryType === "SCHEDULED" ? (date ?? undefined) : undefined,
        deliverySlot: deliveryType === "SCHEDULED" ? (slot ?? undefined) : undefined,
        locale: lang,
        privacyConsent: true,
        items: lines.map(({ line }) => ({
          productSlug: line.productSlug,
          flavorOptionId: line.flavorOptionId,
          packageOptionId: line.packageOptionId,
          ...(line.flavorMix && line.flavorMix.length > 0 ? { flavorMix: line.flavorMix } : {}),
          quantity: line.quantity,
        })),
      }, botToken);

      rememberOrder(result.code, phone.trim()); // "My orders" and notifications can open it on this device
      saveLastOrder({
        ...result,
        customerPhone: phone.trim(),
        deliveryZoneName: settings.deliveryZones.find((z) => String(z.id) === zoneId)?.name ?? "",
        items: lines.map((l) => ({
          name: [l.name, l.detail].filter(Boolean).join(" · "),
          quantity: l.line.quantity,
          lineTotal: l.unitPrice * l.line.quantity,
        })),
      });
      clearCart();
      router.push(`/${lang}/order/confirmation`);
    } catch (error) {
      setErrorCode(error instanceof ApiError ? error.code : "UNKNOWN");
      setErrorProduct(error instanceof ApiError ? (error.product ?? "") : "");
      setSubmitting(false);
      setBotReset((n) => n + 1); // each check token works once; get a new one for the next try
    }
  }

  const errorText = errorCode
    ? (labels.errors[errorCode as keyof typeof labels.errors] ?? labels.errors.UNKNOWN).replace("{product}", errorProduct)
    : null;

  // Wait for the browser so the cart (stored in the browser) is known.
  if (!isClient) {
    return <CheckoutSkeleton label={labels.loadingSettings} />;
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 py-10">
        {showUnavailableNote && <p className="bg-surface px-4 py-3 text-sm">{labels.unavailable}</p>}
        <h2 className="font-display text-4xl uppercase">{labels.emptyTitle}</h2>
        <p className="text-muted">{labels.emptyText}</p>
        <Link href={`/${lang}/menu`} className="flex min-h-12 items-center bg-black px-8 font-bold text-white">
          {labels.toMenu}
        </Link>
      </div>
    );
  }

  const inputClass = "h-12 border-[1.5px] border-black px-3.5 text-base font-normal";
  const choiceClass = (selected: boolean) =>
    `border-[1.5px] border-black ${selected ? "bg-black text-white" : "bg-white text-black hover:bg-surface"}`;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-14">
      {/* Left: customer and delivery details */}
      <div className="flex min-w-0 flex-col gap-8 lg:flex-1">
        {showUnavailableNote && <p className="bg-surface px-4 py-3 text-sm">{labels.unavailable}</p>}

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-4 font-display text-[26px] uppercase tracking-wide">{labels.detailsTitle}</legend>
          {account ? (
            <p className="bg-surface px-4 py-3 text-sm">{labels.signedInAs.replace("{email}", account.email)}</p>
          ) : (
            <p className="bg-surface px-4 py-3 text-sm">
              {labels.signInHint}{" "}
              <Link href={`/${lang}/login?next=${encodeURIComponent(`/${lang}/order`)}`} className="font-semibold underline">
                {labels.signInLink}
              </Link>
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              {labels.name}
              <input
                required
                maxLength={100}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={labels.namePlaceholder}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
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
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-4 font-display text-[26px] uppercase tracking-wide">{labels.deliveryTitle}</legend>

          {settingsFailed && <p role="alert" className="border-[1.5px] border-black p-4 text-sm font-semibold">{labels.settingsError}</p>}
          {!settings && !settingsFailed && (
            <div role="status" aria-label={labels.loadingSettings} className="flex flex-col gap-4">
              <Skeleton className="h-12 w-full" />
              <div className="grid grid-cols-2 gap-2.5">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
              <Skeleton className="h-12 w-full" />
            </div>
          )}

          {settings && (
            <>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                {labels.area}
                <select required value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={`${inputClass} bg-white`}>
                  <option value="" disabled>
                    {labels.areaPlaceholder}
                  </option>
                  {settings.deliveryZones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                    </option>
                  ))}
                </select>
                <span className="text-[13px] font-normal text-muted">{labels.areaHint}</span>
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                {labels.address}
                <input
                  required
                  minLength={5}
                  maxLength={300}
                  autoComplete="street-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={labels.addressPlaceholder}
                  className={inputClass}
                />
              </label>

              <div role="radiogroup" aria-label={labels.whenLabel} className="flex flex-col gap-2.5">
                <span className="text-sm font-semibold">{labels.whenLabel}</span>
                <label
                  className={`flex cursor-pointer items-start gap-3.5 border-[1.5px] p-4 ${
                    deliveryType === "ASAP" ? "border-black" : "border-[#d4d4d4]"
                  } ${asapAllowed ? "" : "cursor-not-allowed opacity-60"}`}
                >
                  <input
                    type="radio"
                    name="deliveryType"
                    disabled={!asapAllowed}
                    checked={deliveryType === "ASAP"}
                    onChange={() => setChosenType("ASAP")}
                    className="mt-0.5 h-5 w-5 accent-black"
                  />
                  <span className="flex flex-col gap-1">
                    <span className="font-bold">{labels.asap}</span>
                    <span className="text-sm text-muted">
                      {isLargeOrder
                        ? labels.asapLarge.replace("{count}", String(settings.largeOrderThreshold))
                        : settings.asapAvailable
                          ? labels.asapHint.replace("{hours}", String(settings.smallOrderLeadHours))
                          : labels.asapClosed}
                    </span>
                  </span>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-3.5 border-[1.5px] p-4 ${
                    deliveryType === "SCHEDULED" ? "border-black" : "border-[#d4d4d4]"
                  }`}
                >
                  <input
                    type="radio"
                    name="deliveryType"
                    checked={deliveryType === "SCHEDULED"}
                    onChange={() => setChosenType("SCHEDULED")}
                    className="mt-0.5 h-5 w-5 accent-black"
                  />
                  <span className="font-bold">{labels.schedule}</span>
                </label>
              </div>

              {deliveryType === "SCHEDULED" && (
                <>
                  <div className="flex flex-col gap-2">
                    <span id="date-label" className="text-sm font-semibold">
                      {labels.date}
                    </span>
                    <div role="group" aria-labelledby="date-label" className="no-scrollbar flex gap-2 overflow-x-auto">
                      {days.map((day) => {
                        const { weekday, day: dayText } = formatDay(day, lang);
                        const selected = day === date;
                        const full = openSlots(day).length === 0;
                        return (
                          <button
                            key={day}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => {
                              setChosenDate(day);
                              setChosenSlot(null);
                            }}
                            className={`flex min-h-16 w-20 shrink-0 flex-col items-center justify-center gap-0.5 ${choiceClass(selected)} ${
                              full && !selected ? "opacity-50" : ""
                            }`}
                          >
                            <span className="text-xs font-semibold">{day === settings.today ? labels.today : weekday}</span>
                            <span className="text-lg font-bold">{dayText}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span id="slot-label" className="text-sm font-semibold">
                      {labels.slot}
                    </span>
                    {availableSlots.length === 0 ? (
                      <p className="text-sm text-muted">{labels.noSlots}</p>
                    ) : (
                      <div role="group" aria-labelledby="slot-label" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {slotsForDate.map((option) => {
                          const open = availableSlots.includes(option);
                          const selected = option === slot;
                          return (
                            <button
                              key={option}
                              type="button"
                              disabled={!open}
                              aria-pressed={selected}
                              onClick={() => setChosenSlot(option)}
                              className={`min-h-12 text-sm font-semibold ${
                                open ? choiceClass(selected) : "border-[1.5px] border-[#d4d4d4] bg-surface text-[#767676] line-through"
                              }`}
                            >
                              {formatSlot(option)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <span className="text-[13px] text-muted">{labels.slotHint.replace("{hours}", String(leadHours))}</span>
                  </div>
                </>
              )}

              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                {labels.note}
                <textarea
                  rows={3}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={labels.notePlaceholder}
                  className="resize-y border-[1.5px] border-black px-3.5 py-3 text-base font-normal"
                />
              </label>
            </>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-4 font-display text-[26px] uppercase tracking-wide">{labels.paymentTitle}</legend>
          <div className="flex flex-col gap-1 border-[1.5px] border-black p-4">
            <span className="font-bold">{labels.payment}</span>
            <span className="text-sm text-muted">{labels.paymentHint}</span>
          </div>
        </fieldset>
      </div>

      {/* Right: order summary */}
      <aside className="flex min-w-0 flex-col gap-5 bg-surface p-5 md:p-8 lg:sticky lg:top-4 lg:w-[400px] lg:shrink-0">
        <h2 className="font-display text-[26px] uppercase tracking-wide">{labels.summary}</h2>
        <ul className="flex flex-col">
          {lines.map((l) => (
            <li key={l.index} className="flex gap-3.5 border-b border-[#d4d4d4] py-4">
              <PhotoBox src={l.imageUrl} alt={l.name} fallbackText="" className="h-[72px] w-[72px] shrink-0" sizes="72px" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex justify-between gap-2">
                  <span className="font-bold">{l.name}</span>
                  <span className="whitespace-nowrap font-bold">{formatPrice(l.unitPrice * l.line.quantity, lang)}</span>
                </div>
                {l.detail && <span className="text-[13px] text-muted">{l.detail}</span>}
                <div className="flex items-center justify-between gap-2">
                  <QuantityInput
                    size="sm"
                    value={l.line.quantity}
                    min={1}
                    max={maxQuantity}
                    onChange={(next) => setLineQuantity(l.index, next, maxQuantity)}
                    label={`${l.name} ${l.detail}`}
                    decreaseLabel={labels.decrease}
                    increaseLabel={labels.increase}
                  />
                  <span className="flex items-center gap-4">
                    <Link
                      href={`/${lang}/menu/${l.line.productSlug}?edit=${l.index}`}
                      className="py-2 text-[13px] font-semibold underline"
                    >
                      {labels.edit}
                    </Link>
                    <button type="button" onClick={() => removeLine(l.index)} className="py-2 text-[13px] font-semibold underline">
                      {labels.remove}
                    </button>
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2.5 text-[15px]">
          <div className="flex justify-between text-[13px] text-muted">
            <span>{labels.portionsLabel}</span>
            <span>{totalPortions}</span>
          </div>
          <div className="flex justify-between border-t-[1.5px] border-black pt-3 text-xl font-bold">
            <span>{labels.total}</span>
            <span>{formatPrice(total, lang)}</span>
          </div>
          <p className="text-[13px] leading-relaxed text-muted">{labels.shippingNote}</p>
        </div>

        {errorText && (
          <p role="alert" className="border-[1.5px] border-black bg-white p-3.5 text-sm font-semibold">
            {errorText}
          </p>
        )}

        <label className="flex items-start gap-3 text-[14px] leading-relaxed">
          <input
            type="checkbox"
            required
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-black"
          />
          <span>
            {labels.consentBefore}{" "}
            <Link href={`/${lang}/privacy`} target="_blank" rel="noopener" className="font-semibold underline">
              {labels.consentPrivacy}
            </Link>{" "}
            {labels.consentAnd}{" "}
            <Link href={`/${lang}/policies`} target="_blank" rel="noopener" className="font-semibold underline">
              {labels.consentPolicies}
            </Link>
            {labels.consentAfter}
          </span>
        </label>
        {settings?.orderingPaused && (
          <div role="alert" className="flex flex-col gap-1 bg-black p-4 text-white">
            <span className="font-bold">{labels.pausedTitle}</span>
            {settings.pauseMessage && <span className="text-sm">{settings.pauseMessage}</span>}
          </div>
        )}
        <TurnstileWidget lang={lang} onToken={setBotToken} resetSignal={botReset} />
        <button
          type="submit"
          disabled={!settings || submitting || settings.orderingPaused}
          className="min-h-14 bg-black text-[17px] font-bold text-white hover:bg-[#333333] disabled:opacity-60"
        >
          {submitting ? labels.placing : `${labels.placeOrder} · ${formatPrice(total, lang)}`}
        </button>
        <p className="text-[13px] leading-relaxed text-muted">{labels.policyNote}</p>
      </aside>
    </form>
  );
}
