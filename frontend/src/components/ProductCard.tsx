import Link from "next/link";
import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/config";
import type { Availability } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { PhotoBox } from "./PhotoBox";
import { SoldOutBadge } from "./SoldOutBadge";

export type ProductCardLabels = {
  new: string;
  soldOut: string;
  from: string;
  photoComingSoon: string;
  sold?: string; // "Sold {count}"
  outOfStock?: string;
  comingSoon?: string;
  ratingShort?: string; // "{average} ({count})"
};

type Props = {
  lang: Locale;
  slug: string;
  name: string;
  price: number; // starting price in VND
  isNew: boolean;
  soldOutUntil?: string | null;
  soldCount?: number | null; // shown only when the shop turned it on
  availability?: Availability;
  rating?: { average: number; count: number } | null;
  imageUrl: string | null;
  labels: ProductCardLabels;
  actionLabel: string;
  eyebrow?: string;
  className?: string;
  style?: CSSProperties;
};

export function soldText(template: string, count: number, lang: Locale): string {
  return template.replace("{count}", count.toLocaleString(lang === "vi" ? "vi-VN" : "en-US"));
}

// Grey card with photo, thin divider, name, price and an underlined action link.
export function ProductCard({
  lang,
  slug,
  name,
  price,
  isNew,
  soldOutUntil = null,
  soldCount = null,
  availability = "AVAILABLE",
  rating = null,
  imageUrl,
  labels,
  actionLabel,
  eyebrow,
  className = "",
  style,
}: Props) {
  return (
    <Link
      href={`/${lang}/menu/${slug}`}
      style={style}
      className={`group flex flex-col gap-3 rounded-xl bg-surface p-3 md:gap-4 md:p-5 ${className}`}
    >
      <div className="relative">
        <PhotoBox
          src={imageUrl}
          alt={name}
          fallbackText={labels.photoComingSoon}
          className={`aspect-square ${availability !== "AVAILABLE" ? "opacity-60" : ""}`}
        />
        <div className="absolute left-2 top-2 flex gap-1.5 md:left-3 md:top-3">
          {isNew && (
            <span className="bg-black px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-white">{labels.new}</span>
          )}
          {availability === "AVAILABLE" ? (
            <SoldOutBadge soldOutUntil={soldOutUntil} label={labels.soldOut} />
          ) : (
            <span className="border-[1.5px] border-black bg-white px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-black">
              {availability === "COMING_SOON" ? labels.comingSoon : labels.outOfStock}
            </span>
          )}
        </div>
      </div>
      <div className="border-t border-ink" />
      <div className="flex min-h-12 flex-col gap-1">
        {eyebrow && <span className="text-xs font-bold uppercase tracking-widest text-muted">{eyebrow}</span>}
        <span className="text-[15px] leading-snug md:text-[17px]">{name}</span>
        {rating && rating.count > 0 && labels.ratingShort && (
          <span className="flex items-center gap-1 text-xs md:text-[13px]">
            <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill="#000000" />
            </svg>
            {labels.ratingShort.replace("{average}", rating.average.toFixed(1)).replace("{count}", String(rating.count))}
          </span>
        )}
        {soldCount != null && labels.sold && (
          <span className="text-xs text-muted md:text-[13px]">{soldText(labels.sold, soldCount, lang)}</span>
        )}
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
