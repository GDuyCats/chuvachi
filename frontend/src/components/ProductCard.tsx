import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { formatPrice } from "@/lib/format";
import type { ProductSummary } from "@/lib/home-content";
import { PhotoBox } from "./PhotoBox";

type Props = {
  lang: Locale;
  product: ProductSummary;
  dict: Dictionary["product"];
  actionLabel: string;
  className?: string;
};

// Grey card with photo, thin divider, name, price and an underlined action link.
export function ProductCard({ lang, product, dict, actionLabel, className = "" }: Props) {
  const name = dict.names[product.slug];
  return (
    <Link
      href={`/${lang}/menu/${product.slug}`}
      className={`group flex flex-col gap-4 rounded-xl bg-surface p-4 md:p-5 ${className}`}
    >
      <div className="relative">
        <PhotoBox src={product.imageUrl} alt={name} fallbackText={dict.photoComingSoon} className="aspect-square" />
        {product.isNew && (
          <span className="absolute left-3 top-3 bg-black px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-white">
            {dict.new}
          </span>
        )}
      </div>
      <div className="border-t border-ink" />
      <span className="min-h-12 text-[17px] leading-snug">{name}</span>
      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="text-[17px] font-bold">
          {dict.from} {formatPrice(product.price, lang)}
        </span>
        <span className="font-semibold underline group-hover:text-muted">{actionLabel}</span>
      </div>
    </Link>
  );
}
