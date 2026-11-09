"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Availability } from "@/lib/api";
import { addToCart, cartItemCount } from "@/lib/cart";
import { QuantityInput } from "../QuantityInput";
import { formatPrice } from "@/lib/format";
import { portionsPerUnit, unitPrice } from "@/lib/pricing";
import { isSoldOutToday, nextDayText } from "@/lib/shop-date";

export type OptionChoice = {
  id: number;
  name: string;
  priceDelta: number;
  portions: number;
  availability: Availability;
};

export type ProductOptionsLabels = {
  flavor: string;
  size: string;
  quantity: string;
  decrease: string;
  increase: string;
  addToOrder: string;
  added: string;
  viewOrder: string;
  onePortion: string;
  portionsEach: string;
  soldOutNote: string;
  outOfStock: string;
  comingSoon: string;
  outOfStockNote: string;
  comingSoonNote: string;
  noFlavorNote: string;
  pickFlavors: string; // "Choose how many of each flavor"
  flavorQuantity: string; // "{name} quantity" (screen readers)
  units: string; // "{count} items" on the add button
};

type Props = {
  lang: Locale;
  slug: string;
  basePrice: number;
  flavors: OptionChoice[];
  packages: OptionChoice[];
  soldOutUntil: string | null; // YYYY-MM-DD, or null
  availability: Availability; // the whole cake
  maxQuantity: number; // most portions of one cake per order (shop setting)
  labels: ProductOptionsLabels;
};

// Size picker, a quantity per flavor (so one order can mix flavors), live price and the "Add to order" button.
export function ProductOptions({
  lang,
  slug,
  basePrice,
  flavors,
  packages,
  soldOutUntil,
  availability,
  maxQuantity,
  labels,
}: Props) {
  // Checked in the browser so a cached page stays right once the sold-out period ends.
  const [soldOut, setSoldOut] = useState(false);
  useEffect(() => {
    setSoldOut(isSoldOutToday(soldOutUntil));
  }, [soldOutUntil]);

  // Start on the first choice that can be ordered.
  const firstAvailable = (choices: OptionChoice[]) =>
    (choices.find((c) => c.availability === "AVAILABLE") ?? choices[0])?.id ?? null;
  const firstFlavorId = firstAvailable(flavors);
  const startCounts = (): Record<number, number> =>
    firstFlavorId !== null && flavors.find((f) => f.id === firstFlavorId)?.availability === "AVAILABLE"
      ? { [firstFlavorId]: 1 }
      : {};
  const [packageId, setPackageId] = useState<number | null>(firstAvailable(packages));
  // Cakes with flavors: a quantity per flavor (e.g. 2 mango + 2 strawberry). Without flavors: one quantity.
  const [counts, setCounts] = useState<Record<number, number>>(startCounts);
  const [quantity, setQuantity] = useState(1);
  const [addedCount, setAddedCount] = useState<number | null>(null);

  const hasFlavors = flavors.length > 0;
  const pack = packages.find((p) => p.id === packageId) ?? null;
  const portions = portionsPerUnit(pack);
  const basePackPrice = unitPrice(basePrice, null, pack);

  // What will be added: one line per flavor with a quantity above 0.
  const chosen = hasFlavors
    ? flavors
        .filter((f) => f.availability === "AVAILABLE" && (counts[f.id] ?? 0) > 0)
        .map((f) => ({ flavor: f, quantity: counts[f.id] }))
    : [{ flavor: null, quantity }];
  const totalUnits = chosen.reduce((sum, line) => sum + line.quantity, 0);
  const totalPrice = chosen.reduce((sum, line) => sum + unitPrice(basePrice, line.flavor, pack) * line.quantity, 0);

  // Why the cake can't be ordered right now, if it can't.
  const noFlavorLeft = hasFlavors && flavors.every((f) => f.availability !== "AVAILABLE");
  const noSizeLeft = packages.length > 0 && packages.every((p) => p.availability !== "AVAILABLE");
  const blockedNote =
    availability === "COMING_SOON"
      ? labels.comingSoonNote
      : availability === "SOLD_OUT"
        ? labels.outOfStockNote
        : noFlavorLeft || noSizeLeft
          ? labels.noFlavorNote
          : null;
  const packOrderable = !pack || pack.availability === "AVAILABLE";
  const canOrder = blockedNote === null && packOrderable && totalUnits > 0;
  const statusLabel = (value: Availability) => (value === "COMING_SOON" ? labels.comingSoon : labels.outOfStock);

  function setCount(flavorId: number, value: number) {
    setCounts((current) => ({ ...current, [flavorId]: Math.max(0, Math.min(maxQuantity, value)) }));
  }

  function handleAdd() {
    if (!canOrder) return;
    let lines: ReturnType<typeof addToCart> | null = null;
    for (const line of chosen) {
      lines = addToCart(
        { productSlug: slug, flavorOptionId: line.flavor?.id ?? null, packageOptionId: packageId, quantity: line.quantity },
        maxQuantity,
      );
    }
    if (lines) setAddedCount(cartItemCount(lines));
    setCounts(startCounts());
    setQuantity(1);
  }

  const optionButton = (selected: boolean, available = true) =>
    available
      ? `border-[1.5px] border-black ${selected ? "bg-black text-white" : "bg-white text-black hover:bg-surface"}`
      : "cursor-not-allowed border-[1.5px] border-dashed border-[#a8a8a8] bg-white text-[#8a8a8a]";

  // [−] [n] [+] control where the number can also be typed; "label" names it for screen readers.
  const stepper = (value: number, onChange: (next: number) => void, label: string, min: number, disabled = false) => (
    <QuantityInput
      value={value}
      min={min}
      max={maxQuantity}
      onChange={onChange}
      label={label}
      decreaseLabel={labels.decrease}
      increaseLabel={labels.increase}
      disabled={disabled}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {blockedNote && (
        <p role="status" className="border-[1.5px] border-black bg-black px-4 py-3 text-[15px] font-semibold text-white">
          {blockedNote}
        </p>
      )}
      {soldOut && soldOutUntil && (
        <p role="status" className="border-[1.5px] border-black px-4 py-3 text-[15px] font-semibold">
          {labels.soldOutNote
            .replace("{date}", soldOutUntil.split("-").reverse().join("/"))
            .replace("{next}", nextDayText(soldOutUntil).split("-").reverse().join("/"))}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-[22px] font-bold md:text-[26px]">{formatPrice(basePackPrice, lang)}</span>
        <span className="text-sm text-muted">
          {portions === 1
            ? labels.onePortion
            : labels.portionsEach
                .replace("{count}", String(portions))
                .replace("{price}", formatPrice(Math.round(basePackPrice / portions), lang))}
        </span>
      </div>

      {packages.length > 0 && (
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-sm font-bold uppercase tracking-wider">{labels.size}</legend>
          <div className="grid grid-cols-3 gap-2.5">
            {packages.map((option) => {
              const available = option.availability === "AVAILABLE";
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={!available}
                  aria-pressed={option.id === packageId}
                  onClick={() => setPackageId(option.id)}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 px-2 ${optionButton(option.id === packageId && available, available)}`}
                >
                  <span className="text-[15px] font-bold">{option.name}</span>
                  <span className="text-[13px]">
                    {available ? formatPrice(unitPrice(basePrice, null, option), lang) : statusLabel(option.availability)}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {hasFlavors ? (
        <fieldset className="flex flex-col">
          <legend className="mb-1 text-sm font-bold uppercase tracking-wider">{labels.flavor}</legend>
          <p className="mb-2 text-sm text-muted">{labels.pickFlavors}</p>
          <ul className="flex flex-col">
            {flavors.map((option) => {
              const available = option.availability === "AVAILABLE";
              const extra = unitPrice(basePrice, option, pack) - basePackPrice;
              return (
                <li key={option.id} className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
                  <span className={`flex min-w-0 flex-col ${available ? "" : "text-[#8a8a8a]"}`}>
                    <span className="text-[15px] font-semibold">{option.name}</span>
                    {!available ? (
                      <span className="text-xs font-bold uppercase tracking-wider">{statusLabel(option.availability)}</span>
                    ) : (
                      extra !== 0 && (
                        <span className="text-xs text-muted">
                          {extra > 0 ? "+" : "−"}
                          {formatPrice(Math.abs(extra), lang)}
                        </span>
                      )
                    )}
                  </span>
                  {stepper(
                    available ? (counts[option.id] ?? 0) : 0,
                    (next) => setCount(option.id, next),
                    labels.flavorQuantity.replace("{name}", option.name),
                    0,
                    !available || blockedNote !== null,
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold uppercase tracking-wider">{labels.quantity}</span>
          {stepper(quantity, (next) => setQuantity(Math.max(1, Math.min(maxQuantity, next))), labels.quantity, 1, blockedNote !== null)}
        </div>
      )}

      <button
        type="button"
        onClick={handleAdd}
        disabled={!canOrder}
        className="min-h-13 bg-black px-6 text-base font-bold text-white hover:bg-[#333333] disabled:cursor-not-allowed disabled:bg-[#bdbdbd] disabled:text-white"
      >
        {blockedNote !== null
          ? availability === "COMING_SOON"
            ? labels.comingSoon
            : labels.outOfStock
          : totalUnits === 0
            ? labels.pickFlavors
            : `${labels.addToOrder} · ${hasFlavors ? `${labels.units.replace("{count}", String(totalUnits))} · ` : ""}${formatPrice(totalPrice, lang)}`}
      </button>

      {addedCount !== null && (
        <div
          key={addedCount}
          role="status"
          className="animate-pop-in flex flex-wrap items-center justify-between gap-2 bg-surface px-4 py-3.5"
        >
          <span className="text-[15px] font-semibold">{labels.added.replace("{count}", String(addedCount))}</span>
          <Link href={`/${lang}/order`} className="py-1.5 text-[15px] font-bold underline">
            {labels.viewOrder}
          </Link>
        </div>
      )}
    </div>
  );
}
