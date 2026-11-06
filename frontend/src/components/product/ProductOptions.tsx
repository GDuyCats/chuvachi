"use client";

import Link from "next/link";
import { useState } from "react";
import type { Locale } from "@/i18n/config";
import { addToCart, cartItemCount, MAX_LINE_QUANTITY } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import { portionsPerUnit, unitPrice } from "@/lib/pricing";

export type OptionChoice = {
  id: number;
  name: string;
  priceDelta: number;
  portions: number;
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
};

type Props = {
  lang: Locale;
  slug: string;
  basePrice: number;
  flavors: OptionChoice[];
  packages: OptionChoice[];
  labels: ProductOptionsLabels;
};

// Flavor and size pickers, live price, quantity and the "Add to order" button.
export function ProductOptions({ lang, slug, basePrice, flavors, packages, labels }: Props) {
  const [flavorId, setFlavorId] = useState<number | null>(flavors[0]?.id ?? null);
  const [packageId, setPackageId] = useState<number | null>(packages[0]?.id ?? null);
  const [quantity, setQuantity] = useState(1);
  const [addedCount, setAddedCount] = useState<number | null>(null);

  const flavor = flavors.find((f) => f.id === flavorId) ?? null;
  const pack = packages.find((p) => p.id === packageId) ?? null;
  const price = unitPrice(basePrice, flavor, pack);
  const portions = portionsPerUnit(pack);

  function handleAdd() {
    const lines = addToCart({ productSlug: slug, flavorOptionId: flavorId, packageOptionId: packageId, quantity });
    setAddedCount(cartItemCount(lines));
    setQuantity(1);
  }

  const optionButton = (selected: boolean) =>
    `border-[1.5px] border-black ${selected ? "bg-black text-white" : "bg-white text-black hover:bg-surface"}`;

  return (
    <div className="flex flex-col gap-6">
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
            {flavors.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={option.id === flavorId}
                onClick={() => setFlavorId(option.id)}
                className={`min-h-11 px-4 text-[15px] font-semibold ${optionButton(option.id === flavorId)}`}
              >
                {option.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {packages.length > 0 && (
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-sm font-bold uppercase tracking-wider">{labels.size}</legend>
          <div className="grid grid-cols-3 gap-2.5">
            {packages.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={option.id === packageId}
                onClick={() => setPackageId(option.id)}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 px-2 ${optionButton(option.id === packageId)}`}
              >
                <span className="text-[15px] font-bold">{option.name}</span>
                <span className="text-[13px]">{formatPrice(unitPrice(basePrice, flavor, option), lang)}</span>
              </button>
            ))}
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
            onClick={() => setQuantity((q) => Math.min(MAX_LINE_QUANTITY, q + 1))}
            className="h-full w-12 text-2xl"
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="min-h-13 flex-1 basis-56 bg-black px-6 text-base font-bold text-white hover:bg-[#333333]"
        >
          {labels.addToOrder} · {formatPrice(price * quantity, lang)}
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
