import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { seasonalItems } from "@/lib/home-content";
import { ProductCard } from "../ProductCard";

type Props = {
  lang: Locale;
  dict: Dictionary["home"]["seasonal"];
  productDict: Dictionary["product"];
};

// Big black season card on the left, swipeable product cards on the right.
export function SeasonalBlock({ lang, dict, productDict }: Props) {
  return (
    <section id="seasonal" className="flex flex-col gap-7 px-4 pb-16 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-4xl uppercase tracking-wide md:text-[40px]">{dict.title}</h2>
        <Link href={`/${lang}/menu`} className="py-2 text-[15px] font-semibold underline">
          {dict.viewAll}
        </Link>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="flex flex-col justify-between gap-6 rounded-xl bg-black p-7 text-white md:p-12 lg:w-[38%] lg:shrink-0">
          <div className="flex flex-col gap-4">
            <span className="text-[13px] font-bold uppercase tracking-[0.16em]">{dict.eyebrow}</span>
            <h3 className="font-display text-5xl uppercase leading-[1.05] md:text-[64px]">{dict.name}</h3>
            <p className="max-w-sm text-base text-[#d4d4d4]">{dict.description}</p>
          </div>
          <Link
            href={`/${lang}/menu?category=tiramisu`}
            className="self-start bg-white px-7 py-3.5 text-[15px] font-bold text-black hover:bg-[#e5e5e5]"
          >
            {dict.cta}
          </Link>
        </div>

        <div className="min-w-0 flex-1">
          <div
            role="region"
            aria-label={dict.scrollHint}
            tabIndex={0}
            className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto md:gap-6"
          >
            {seasonalItems.map((product) => (
              <ProductCard
                key={product.slug}
                lang={lang}
                product={product}
                dict={productDict}
                actionLabel={dict.orderNow}
                className="w-[75%] shrink-0 snap-start sm:w-[45%] xl:w-[calc((100%-48px)/3)]"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
