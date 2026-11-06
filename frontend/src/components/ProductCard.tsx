import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { formatPrice } from "@/lib/format";
import { PhotoBox } from "./PhotoBox";

export type ProductCardLabels = {
  new: string;
  from: string;
  photoComingSoon: string;
};

type Props = {
  lang: Locale;
  slug: string;
  name: string;
  price: number; // starting price in VND
  isNew: boolean;
  imageUrl: string | null;
  labels: ProductCardLabels;
  actionLabel: string;
  eyebrow?: string;
  className?: string;
};

// Grey card with photo, thin divider, name, price and an underlined action link.
export function ProductCard({
  lang,
  slug,
  name,
  price,
  isNew,
  imageUrl,
  labels,
  actionLabel,
  eyebrow,
  className = "",
}: Props) {
  return (
    <Link href={`/${lang}/menu/${slug}`} className={`group flex flex-col gap-3 rounded-xl bg-surface p-3 md:gap-4 md:p-5 ${className}`}>
      <div className="relative">
        <PhotoBox src={imageUrl} alt={name} fallbackText={labels.photoComingSoon} className="aspect-square" />
        {isNew && (
          <span className="absolute left-2 top-2 bg-black px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-white md:left-3 md:top-3">
            {labels.new}
          </span>
        )}
      </div>
      <div className="border-t border-ink" />
      <div className="flex min-h-12 flex-col gap-1">
        {eyebrow && <span className="text-xs font-bold uppercase tracking-widest text-muted">{eyebrow}</span>}
        <span className="text-[15px] leading-snug md:text-[17px]">{name}</span>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="text-sm font-bold md:text-[17px]">
          {labels.from} {formatPrice(price, lang)}
        </span>
        <span className="text-sm font-semibold underline group-hover:text-muted md:text-base">{actionLabel}</span>
      </div>
    </Link>
  );
}
