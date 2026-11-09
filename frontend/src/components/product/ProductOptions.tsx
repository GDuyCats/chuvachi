"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Availability } from "@/lib/api";
import { addToCart, cartItemCount } from "@/lib/cart";
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

// Flavor and size pickers, live price, quantity and the "Add to order" button.
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
  const [flavorId, setFlavorId] = useState<number | null>(firstAvailable(flavors));
  const [packageId, setPackageId] = useState<number | null>(firstAvailable(packages));
  const [quantity, setQuantity] = useState(1);
  const [addedCount, setAddedCount] = useState<number | null>(null);

  const flavor = flavors.find((f) => f.id === flavorId) ?? null;
  const pack = packages.find((p) => p.id === packageId) ?? null;
  const price = unitPrice(basePrice, flavor, pack);
  const portions = portionsPerUnit(pack);

  // Why the cake can't be ordered right now, if it can't.
  const noFlavorLeft = flavors.length > 0 && flavors.every((f) => f.availability !== "AVAILABLE");
  const noSizeLeft = packages.length > 0 && packages.every((p) => p.availability !== "AVAILABLE");
  const blockedNote =
    availability === "COMING_SOON"
      ? labels.comingSoonNote
      : availability === "SOLD_OUT"
        ? labels.outOfStockNote
        : noFlavorLeft || noSizeLeft
          ? labels.noFlavorNote
          : null;
  const isOrderable = (choice: OptionChoice | null) => !choice || choice.availability === "AVAILABLE";
  const canOrder = blockedNote === null && isOrderable(flavor) && isOrderable(pack);
  const statusLabel = (value: Availability) => (value === "COMING_SOON" ? labels.comingSoon : labels.outOfStock);

  function handleAdd() {
    if (!canOrder) return;
    const lines = addToCart({ productSlug: slug, flavorOptionId: flavorId, packageOptionId: packageId, quantity }, maxQuantity);
    setAddedCount(cartItemCount(lines));
    setQuantity(1);
  }

  const optionButton = (selected: boolean, available = true) =>
    available
      ? `border-[1.5px] border-black ${selected ? "bg-black text-white" : "bg-white text-black hover:bg-surface"}`
      : "cursor-not-allowed border-[1.5px] border-dashed border-[#a8a8a8] bg-white text-[#8a8a8a]";

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
        <span className="text-[22px] font-bold md:text-[26px]" aria-live="polite">
          {formatPrice(price, lang)}
        </span>
        <span className="text-sm text-muted">
          {portions === 1
            ? labels.onePortion
            : labels.portionsEach
                .replace("{count}", String(portions))
                .replace("{price}", formatPrice(Math.round(price / portions), lang))}
        </span>
      </div>

      {flavors.length > 0 && (
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-sm font-bold uppercase tracking-wider">{labels.flavor}</legend>
          <div className="flex flex-wrap gap-2.5">
            {flavors.map((option) => {
              const available = option.availability === "AVAILABLE";
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={!available}
                  aria-pressed={option.id === flavorId}
                  onClick={() => setFlavorId(option.id)}
                  className={`min-h-11 px-4 text-[15px] font-semibold ${optionButton(option.id === flavorId && available, available)}`}
                >
                  {option.name}
                  {!available && <span className="ml-1.5 text-xs font-bold uppercase tracking-wider">· {statusLabel(option.availability)}</span>}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

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
                    {available ? formatPrice(unitPrice(basePrice, flavor, option), lang) : statusLabel(option.availability)}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-stretch gap-3">
        <div role="group" aria-label={labels.quantity} className="flex h-13 items-center border-[1.5px] border-black">
          <button
            type="button"
            aria-label={labels.decrease}
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="h-full w-12 text-2xl"
          >
            −
          </button>
          <span className="min-w-9 text-center text-[17px] font-bold">{quantity}</span>
          <button
            type="button"
            aria-label={labels.increase}
            onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
            className="h-full w-12 text-2xl"
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canOrder}
          className="min-h-13 flex-1 basis-56 bg-black px-6 text-base font-bold text-white hover:bg-[#333333] disabled:cursor-not-allowed disabled:bg-[#bdbdbd] disabled:text-white"
        >
          {canOrder
            ? `${labels.addToOrder} · ${formatPrice(price * quantity, lang)}`
            : availability === "COMING_SOON"
              ? labels.comingSoon
              : labels.outOfStock}
        </button>
      </div>

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
