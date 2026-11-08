"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Availability } from "@/lib/api";
import { ProductCard, type ProductCardLabels } from "../ProductCard";

export type MenuItem = {
  slug: string;
  name: string;
  price: number;
  isNew: boolean;
  soldOutUntil: string | null;
  soldCount: number | null;
  availability: Availability;
  rating: { average: number; count: number } | null;
  imageUrl: string | null;
  categorySlug: string;
  categoryName: string;
};

export type MenuLabels = {
  filterLabel: string;
  all: string;
  new: string;
  countOne: string;
  countOther: string;
  view: string;
  empty: string;
};

type Props = {
  lang: Locale;
  items: MenuItem[];
  labels: MenuLabels;
  cardLabels: ProductCardLabels;
};

const ALL = "all";
const NEW = "new";

// Category filter + product grid. Filtering happens in the browser, and the URL
// is updated (?category=...) so a filtered menu can be shared as a link.
export function MenuGrid({ lang, items, labels, cardLabels }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Build the filter list from the categories that actually have products.
  const categories = Array.from(new Map(items.map((item) => [item.categorySlug, item.categoryName])).entries());
  const filters = [
    { id: ALL, label: labels.all },
    ...(items.some((item) => item.isNew) ? [{ id: NEW, label: labels.new }] : []),
    ...categories.map(([id, label]) => ({ id, label })),
  ];

  const requested = searchParams.get("category") ?? ALL;
  const [active, setActive] = useState(filters.some((f) => f.id === requested) ? requested : ALL);
  const requestedIsKnown = filters.some((f) => f.id === requested);

  // Follow the address when it changes while on this page (e.g. a category picked in the search box).
  useEffect(() => {
    setActive(requestedIsKnown ? requested : ALL);
  }, [requested, requestedIsKnown]);

  function choose(id: string) {
    setActive(id);
    const query = id === ALL ? "" : `?category=${encodeURIComponent(id)}`;
    router.replace(`${pathname}${query}`, { scroll: false });
  }

  const visible = items.filter((item) => {
    if (active === ALL) return true;
    if (active === NEW) return item.isNew;
    return item.categorySlug === active;
  });
  const countText = visible.length === 1 ? labels.countOne : labels.countOther.replace("{count}", String(visible.length));

  return (
    <>
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 pb-4 pt-6 md:px-10">
        <div role="group" aria-label={labels.filterLabel} className="no-scrollbar flex max-w-full gap-2.5 overflow-x-auto">
          {filters.map((filter) => {
            const selected = filter.id === active;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => choose(filter.id)}
                aria-pressed={selected}
                className={`min-h-11 shrink-0 border-[1.5px] border-black px-4 text-sm font-bold uppercase tracking-wide ${
                  selected ? "bg-black text-white" : "bg-white text-black hover:bg-surface"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
        <span className="text-sm text-muted" aria-live="polite">
          {countText}
        </span>
      </div>

      <div className="px-4 pb-20 pt-8 md:px-10">
        {visible.length === 0 ? (
          <p className="border border-dashed border-[#a8a8a8] p-8 text-center text-muted">{labels.empty}</p>
        ) : (
          <div key={active} className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 xl:grid-cols-4">
            {visible.map((item, index) => (
              <ProductCard
                className="animate-card-in"
                style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
                key={item.slug}
                lang={lang}
                slug={item.slug}
                name={item.name}
                price={item.price}
                isNew={item.isNew}
                soldOutUntil={item.soldOutUntil}
                soldCount={item.soldCount}
                availability={item.availability}
                rating={item.rating}
                imageUrl={item.imageUrl}
                labels={cardLabels}
                actionLabel={labels.view}
                eyebrow={item.categoryName}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
