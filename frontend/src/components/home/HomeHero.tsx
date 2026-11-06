import Image from "next/image";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { HomeContent } from "@/lib/api";

type Props = {
  lang: Locale;
  hero: NonNullable<HomeContent["hero"]>;
  fallbackCta: string;
};

// Full-width dark banner for the newest cake. Text sits on top on phones, beside the photo on desktop.
export function HomeHero({ lang, hero, fallbackCta }: Props) {
  const href = hero.productSlug ? `/${lang}/menu/${hero.productSlug}` : `/${lang}/menu`;

  return (
    <section
      id="new"
      className="flex flex-col gap-8 bg-[#141414] px-4 py-12 text-white md:flex-row md:items-center md:px-14 md:py-20"
    >
      <div className="flex max-w-xl flex-1 flex-col gap-4">
        {hero.eyebrow && <span className="text-[13px] font-bold uppercase tracking-[0.16em]">{hero.eyebrow}</span>}
        <h1 className="font-display text-5xl uppercase leading-[1.05] md:text-7xl">{hero.title}</h1>
        {hero.subtitle && <p className="text-[15px] font-semibold md:text-[17px]">{hero.subtitle}</p>}
        <Link href={href} className="mt-2 self-start bg-white px-10 py-3.5 text-[15px] font-bold text-black hover:bg-[#e5e5e5]">
          {hero.cta ?? fallbackCta}
        </Link>
      </div>

      {hero.imageUrl && (
        <div className="relative aspect-[4/3] flex-1 overflow-hidden md:aspect-[16/11]">
          <Image src={hero.imageUrl} alt={hero.title} fill priority sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
        </div>
      )}
    </section>
  );
}
