import { notFound } from "next/navigation";
import { CategoryTiles } from "@/components/home/CategoryTiles";
import { ComingSoon } from "@/components/home/ComingSoon";
import { HomeHero } from "@/components/home/HomeHero";
import { SeasonalBlock } from "@/components/home/SeasonalBlock";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    notFound();
  }
  const dict = await getDictionary(lang);

  return (
    <>
      <HomeHero lang={lang} dict={dict.home.hero} />
      <CategoryTiles lang={lang} title={dict.home.menuTitle} labels={dict.home.categories} />
      <SeasonalBlock lang={lang} dict={dict.home.seasonal} productDict={dict.product} />
      <ComingSoon dict={dict.home.comingSoon} />
    </>
  );
}
