import { notFound } from "next/navigation";
import { CategoryTiles } from "@/components/home/CategoryTiles";
import { ComingSoon } from "@/components/home/ComingSoon";
import { HomeHero } from "@/components/home/HomeHero";
import { LatestNews } from "@/components/home/LatestNews";
import { SeasonalBlock } from "@/components/home/SeasonalBlock";
import { Reveal } from "@/components/Reveal";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getHomeContent, getPosts } from "@/lib/api";

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    notFound();
  }
  const [dict, home, posts] = await Promise.all([getDictionary(lang), getHomeContent(lang), getPosts(lang)]);

  return (
    <>
      {home.heroSlides.length > 0 && (
        <HomeHero lang={lang} slides={home.heroSlides} intervalSeconds={home.heroInterval} labels={dict.home} />
      )}
      <Reveal>
        <CategoryTiles
          lang={lang}
          title={dict.home.menuTitle}
          newLabel={dict.home.newTile}
          hasNew={home.hasNew}
          categories={home.categories}
        />
      </Reveal>
      {home.season && (
        <Reveal>
          <SeasonalBlock lang={lang} season={home.season} labels={dict.home.seasonal} productLabels={dict.product} />
        </Reveal>
      )}
      {posts.length > 0 && (
        <Reveal>
          <LatestNews lang={lang} posts={posts} labels={dict.news} />
        </Reveal>
      )}
      <Reveal>
        <ComingSoon title={dict.home.comingSoonTitle} items={home.comingSoon} />
      </Reveal>
    </>
  );
}
