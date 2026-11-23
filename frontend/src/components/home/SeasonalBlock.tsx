import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import type { HomeContent } from "@/lib/api";
import { DragScroller } from "../DragScroller";
import { ProductCard } from "../ProductCard";

type Props = {
  lang: Locale;
  season: NonNullable<HomeContent["season"]>;
  labels: Dictionary["home"]["seasonal"];
  productLabels: Dictionary["product"];
};

// Big black season card on the left, product cards on the right that can be swiped (phones)
// or dragged with the mouse (computers).
export function SeasonalBlock({ lang, season, labels, productLabels }: Props) {
  return (
    <section id="seasonal" className="flex flex-col gap-7 px-4 pb-16 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-4xl uppercase tracking-wide md:text-[40px]">{labels.title}</h2>
        <Link href={`/${lang}/menu`} className="py-2 text-[15px] font-semibold underline">
          {labels.viewAll}
        </Link>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="flex flex-col justify-between gap-6 rounded-xl bg-hero p-7 text-hero-ink md:p-12 lg:w-[38%] lg:shrink-0">
          <div className="flex flex-col gap-4">
            {season.eyebrow && <span className="text-[13px] font-bold uppercase tracking-[0.16em]">{season.eyebrow}</span>}
            <h3 className="font-display text-5xl uppercase leading-[1.05] md:text-[64px]">{season.name}</h3>
            {season.description && <p className="max-w-sm text-base text-hero-ink/80">{season.description}</p>}
          </div>
          <Link href={`/${lang}/menu`} className="self-start bg-white px-7 py-3.5 text-[15px] font-bold text-black hover:bg-[#e5e5e5]">
            {labels.cta}
          </Link>
        </div>

        <div className="min-w-0 flex-1">
          <DragScroller
            role="region"
            aria-label={labels.scrollHint}
            tabIndex={0}
            className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto md:gap-6"
          >
            {season.products.map((product) => (
              <ProductCard
                key={product.slug}
                lang={lang}
                productId={product.id}
                slug={product.slug}
                name={product.name}
                price={product.price}
                isNew={product.isNew}
                availability={product.availability}
                imageUrl={product.imageUrl}
                labels={productLabels}
                actionLabel={labels.orderNow}
                className="w-[75%] shrink-0 snap-start sm:w-[45%] xl:w-[calc((100%-48px)/3)]"
              />
            ))}
          </DragScroller>
        </div>
      </div>
    </section>
  );
}
