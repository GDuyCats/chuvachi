import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewsBoard } from "@/components/news/NewsBoard";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getPosts } from "@/lib/api";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return {
    title: `${dict.news.title} — Chuvachi`,
    description: dict.news.intro,
    alternates: { canonical: `/${lang}/news`, languages: { vi: "/vi/news", en: "/en/news" } },
  };
}

export default async function NewsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const [dict, posts] = await Promise.all([getDictionary(lang), getPosts(lang)]);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-20 pt-10 md:px-10 md:pt-16">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-5xl uppercase leading-none md:text-7xl">{dict.news.title}</h1>
        <p className="max-w-2xl text-muted">{dict.news.intro}</p>
      </header>
      <NewsBoard lang={lang} posts={posts} initialPost={null} labels={dict.news} />
    </section>
  );
}
