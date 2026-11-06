import { notFound } from "next/navigation";
import { CategoryTiles } from "@/components/home/CategoryTiles";
import { ComingSoon } from "@/components/home/ComingSoon";
import { HomeHero } from "@/components/home/HomeHero";
import { SeasonalBlock } from "@/components/home/SeasonalBlock";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getHomeContent } from "@/lib/api";

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    notFound();
  }
  const [dict, home] = await Promise.all([getDictionary(lang), getHomeContent(lang)]);

  return (
    <>
      {home.hero && <HomeHero lang={lang} hero={home.hero} fallbackCta={dict.home.heroCta} />}
      <CategoryTiles
        lang={lang}
        title={dict.home.menuTitle}
        newLabel={dict.home.newTile}
        hasNew={home.hasNew}
        categories={home.categories}
      />
      {home.season && <SeasonalBlock lang={lang} season={home.season} labels={dict.home.seasonal} productLabels={dict.product} />}
      <ComingSoon title={dict.home.comingSoonTitle} items={home.comingSoon} />
    </>
  );
}
