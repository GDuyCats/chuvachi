import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { HomeContent } from "@/lib/api";

type Props = {
  lang: Locale;
  title: string;
  newLabel: string;
  hasNew: boolean;
  categories: HomeContent["categories"];
};

// Tiles take turns being black, white and grey.
const tileStyles = ["bg-black text-white", "bg-white text-black", "bg-[#ededed] text-black"];

// One tile per category (from the admin "Products" page), plus "New" when there are new cakes.
export function CategoryTiles({ lang, title, newLabel, hasNew, categories }: Props) {
  const tiles = [...(hasNew ? [{ slug: "new", name: newLabel }] : []), ...categories];
  if (tiles.length === 0) {
    return null;
  }

  return (
    <section id="menu" className="flex flex-col items-center gap-7 px-4 py-12 md:px-10 md:py-16">
      <h2 className="font-display text-4xl tracking-wide md:text-[40px]">{title.toUpperCase()}</h2>
      <div className="grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 md:gap-5">
        {tiles.map((tile, index) => (
          <Link
            key={tile.slug}
            href={`/${lang}/menu?category=${encodeURIComponent(tile.slug)}`}
            className={`flex h-36 items-end border-[1.5px] border-black p-4 transition-transform hover:-translate-y-1 md:h-56 ${tileStyles[index % tileStyles.length]}`}
          >
            <span className="font-display text-xl uppercase tracking-wide md:text-[22px]">{tile.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
