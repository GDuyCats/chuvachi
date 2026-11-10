import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import type { PostCard } from "@/lib/api";
import { formatPostDate } from "@/lib/post-date";

// The three newest news posts on the homepage; each opens on the News page.
export function LatestNews({ lang, posts, labels }: { lang: Locale; posts: PostCard[]; labels: Dictionary["news"] }) {
  if (posts.length === 0) return null;
  return (
    <section className="flex flex-col gap-6 px-4 py-14 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-4xl uppercase md:text-5xl">{labels.homeTitle}</h2>
        <Link href={`/${lang}/news`} className="py-2 text-[15px] font-bold underline">
          {labels.viewAll}
        </Link>
      </div>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {posts.slice(0, 3).map((post) => (
          <li key={post.slug}>
            <Link href={`/${lang}/news/${post.slug}`} className="flex h-full flex-col gap-2 border-[1.5px] border-black p-5 hover:bg-[#fafafa]">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em]">
                {labels.categories[post.category]}
                <span className="ml-2 font-semibold normal-case tracking-normal text-muted">{formatPostDate(post.publishedAt, lang)}</span>
              </span>
              <span className="text-lg font-bold leading-snug">{post.title}</span>
              <span className="line-clamp-3 text-sm text-[#444444]">{post.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
