import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewsBoard } from "@/components/news/NewsBoard";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getPost, getPosts } from "@/lib/api";

// Pre-build each published post. Cache Components needs at least one entry, so with no posts
// yet a placeholder is listed (it simply shows "not found").
export async function generateStaticParams({ params }: { params: { lang: string } }) {
  if (!isLocale(params.lang)) return [];
  const posts = await getPosts(params.lang);
  return posts.length > 0 ? posts.map((post) => ({ slug: post.slug })) : [{ slug: "welcome" }];
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string; slug: string }> }): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLocale(lang)) return {};
  const post = await getPost(lang, slug);
  if (!post) return {};
  return {
    title: `${post.title} — Chuvachi`,
    description: post.summary,
    alternates: { canonical: `/${lang}/news/${slug}`, languages: { vi: `/vi/news/${slug}`, en: `/en/news/${slug}` } },
    openGraph: {
      title: post.title,
      description: post.summary,
      images: post.coverImageUrl ? [{ url: post.coverImageUrl, alt: post.title }] : [{ url: "/og-default.png", width: 1200, height: 630, alt: "Chuvachi" }],
    },
  };
}

// A shared link to one post: the news page with that post already open (and its text in the HTML).
export default async function NewsPostPage({ params }: { params: Promise<{ lang: string; slug: string }> }) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const [dict, posts, post] = await Promise.all([getDictionary(lang), getPosts(lang), getPost(lang, slug)]);
  if (!post) notFound();

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-20 pt-10 md:px-10 md:pt-16">
      <header className="flex flex-col gap-3">
        <p className="font-display text-5xl uppercase leading-none md:text-7xl">{dict.news.title}</p>
        <p className="max-w-2xl text-muted">{dict.news.intro}</p>
      </header>
      <NewsBoard lang={lang} posts={posts} initialPost={post} labels={dict.news} />
    </section>
  );
}
