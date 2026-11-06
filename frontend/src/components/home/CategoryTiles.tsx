import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { categoryTiles, type CategoryTile } from "@/lib/home-content";

type Props = {
  lang: Locale;
  title: string;
  labels: Dictionary["home"]["categories"];
};

const tileStyles: Record<CategoryTile["style"], string> = {
  black: "bg-black text-white",
  white: "bg-white text-black",
  grey: "bg-[#ededed] text-black",
};

export function CategoryTiles({ lang, title, labels }: Props) {
  return (
    <section id="menu" className="flex flex-col items-center gap-7 px-4 py-12 md:px-10 md:py-16">
      <h2 className="font-display text-4xl tracking-wide md:text-[40px]">{title.toUpperCase()}</h2>
      <div className="grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 md:gap-5">
        {categoryTiles.map((tile) => (
          <Link
            key={tile.key}
            href={`/${lang}/menu?category=${tile.key}`}
            className={`flex h-36 items-end border-[1.5px] border-black p-4 transition-transform hover:-translate-y-1 md:h-56 ${tileStyles[tile.style]}`}
          >
            <span className="font-display text-xl uppercase tracking-wide md:text-[22px]">{labels[tile.key]}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
