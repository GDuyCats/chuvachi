import Image from "next/image";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { heroBanner } from "@/lib/home-content";

type Props = {
  lang: Locale;
  dict: Dictionary["home"]["hero"];
};

// Full-width dark banner for the newest cake. Text sits on top on phones, beside the photo on desktop.
export function HomeHero({ lang, dict }: Props) {
  return (
    <section
      id="new"
      className="flex flex-col gap-8 bg-[#141414] px-4 py-12 text-white md:flex-row md:items-center md:px-14 md:py-20"
    >
      <div className="flex max-w-xl flex-1 flex-col gap-4">
        <span className="text-[13px] font-bold uppercase tracking-[0.16em]">{dict.eyebrow}</span>
        <h1 className="font-display text-5xl uppercase leading-[1.05] md:text-7xl">{dict.title}</h1>
        <p className="text-[15px] font-semibold md:text-[17px]">{dict.subtitle}</p>
        <Link
          href={`/${lang}${heroBanner.ctaPath}`}
          className="mt-2 self-start bg-white px-10 py-3.5 text-[15px] font-bold text-black hover:bg-[#e5e5e5]"
        >
          {dict.cta}
        </Link>
      </div>

      {heroBanner.imageUrl && (
        <div className="relative aspect-[4/3] flex-1 overflow-hidden md:aspect-[16/11]">
          <Image
            src={heroBanner.imageUrl}
            alt={dict.title}
            fill
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
      )}
    </section>
  );
}
