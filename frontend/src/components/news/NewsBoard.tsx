"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import type { PostCard, PostFull } from "@/lib/api";
import { formatPostDate } from "@/lib/post-date";
import { request } from "@/lib/public-api";
import { PostBody } from "./PostBody";
import { PostComments } from "./PostComments";

type Labels = Dictionary["news"];

// The news cards in two columns. Opening one shows the whole post in a window over the page
// (like Steam's news), with buttons to close it, go to the post above or below, or go home.
// The address bar follows the open post (/vi/news/<slug>), so it can be shared or reloaded.
export function NewsBoard({
  lang,
  posts,
  initialPost,
  labels,
}: {
  lang: Locale;
  posts: PostCard[];
  initialPost: PostFull | null; // opened from /news/<slug>
  labels: Labels;
}) {
  const [openSlug, setOpenSlug] = useState<string | null>(initialPost?.slug ?? null);
  const [cache, setCache] = useState<Record<string, PostFull>>(initialPost ? { [initialPost.slug]: initialPost } : {});
  const [failed, setFailed] = useState(false);
  const pushedRef = useRef(false); // true when opening the post added a browser history entry
  const lastCardRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  const listPath = `/${lang}/news`;
  const postPath = (slug: string) => `/${lang}/news/${slug}`;

  // Loads a post's full text once.
  useEffect(() => {
    if (!openSlug || cache[openSlug]) return;
    let active = true;
    setFailed(false);
    request<PostFull>(`/api/posts/${encodeURIComponent(openSlug)}?locale=${lang}`, { cache: "no-store" })
      .then((post) => {
        if (active) setCache((current) => ({ ...current, [post.slug]: post }));
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [openSlug, cache, lang]);

  const open = useCallback(
    (slug: string, card?: HTMLElement) => {
      if (card) lastCardRef.current = card;
      setOpenSlug(slug);
      window.history.pushState({ newsSlug: slug }, "", postPath(slug));
      pushedRef.current = true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- postPath only depends on lang
    [lang],
  );

  const close = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back(); // the popstate handler below closes the window
    } else {
      setOpenSlug(null);
      window.history.replaceState(null, "", listPath);
    }
  }, [listPath]);

  // Up / down: the post above or below in the list; the address changes without adding history.
  const index = openSlug ? posts.findIndex((p) => p.slug === openSlug) : -1;
  const step = (delta: number) => {
    const next = posts[index + delta];
    if (!next) return;
    setOpenSlug(next.slug);
    window.history.replaceState({ newsSlug: next.slug }, "", postPath(next.slug));
    panelRef.current?.scrollTo({ top: 0 });
    panelRef.current?.parentElement?.parentElement?.scrollTo({ top: 0 });
  };

  // Browser Back / Forward.
  useEffect(() => {
    const onPop = () => {
      const match = window.location.pathname.match(/\/news\/([^/]+)$/);
      pushedRef.current = false;
      setOpenSlug(match ? decodeURIComponent(match[1]) : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // While a post is open: Escape closes it, the page behind doesn't scroll, focus goes to the window.
  useEffect(() => {
    if (!openSlug) {
      lastCardRef.current?.focus();
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [openSlug, close]);

  function onCardClick(event: MouseEvent<HTMLAnchorElement>, slug: string) {
    // Keep Ctrl/Cmd-click and middle-click opening a new tab.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    open(slug, event.currentTarget);
  }

  const post = openSlug ? cache[openSlug] : undefined;
  const sideButton =
    "flex h-12 w-12 items-center justify-center border-[1.5px] border-black bg-white text-black hover:bg-[#ececec] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white";

  return (
    <>
      {posts.length === 0 ? (
        <p className="border border-dashed border-[#a8a8a8] p-8 text-center text-muted">{labels.empty}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {posts.map((card) => (
            <li key={card.slug}>
              <a
                href={postPath(card.slug)}
                onClick={(event) => onCardClick(event, card.slug)}
                className="group flex h-full flex-col border-[1.5px] border-black bg-white hover:bg-[#fafafa]"
              >
                {card.coverImageUrl && (
                  <div className="aspect-[16/9] overflow-hidden border-b-[1.5px] border-black">
                    {/* eslint-disable-next-line @next/next/no-img-element -- post cover */}
                    <img
                      src={card.coverImageUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <span className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em]">
                    {card.pinned && <span className="bg-black px-1.5 py-0.5 text-white">{labels.pinned}</span>}
                    <span>{labels.categories[card.category]}</span>
                    <span className="font-semibold normal-case tracking-normal text-muted">{formatPostDate(card.publishedAt, lang)}</span>
                  </span>
                  <h2 className="text-xl font-bold leading-snug">{card.title}</h2>
                  <p className="relative line-clamp-4 text-[15px] leading-relaxed text-[#444444]">{card.summary}</p>
                  <span className="mt-auto pt-2 text-sm font-bold underline">{labels.readMore} →</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}

      {openSlug && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/70"
          onClick={(event) => {
            if (event.target === event.currentTarget) close(); // a click beside the window
          }}
        >
          <div
            className="mx-auto flex max-w-4xl items-start gap-3 px-3 py-6 md:py-12"
            onClick={(event) => {
              if (event.target === event.currentTarget) close();
            }}
          >
            <article
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="news-post-title"
              className="min-w-0 flex-1 bg-white outline-none"
            >
              {!post && !failed && <p className="p-8 text-muted">{labels.loading}</p>}
              {!post && failed && <p className="p-8 font-semibold">{labels.error}</p>}
              {post && (
                <>
                  <header className="flex flex-col gap-2 border-b border-line bg-[#f4f4f4] px-5 py-5 md:px-8">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em]">
                      {labels.categories[post.category]}
                      <span className="ml-2 font-semibold normal-case tracking-normal text-muted">
                        {labels.posted.replace("{date}", formatPostDate(post.publishedAt, lang))}
                      </span>
                    </span>
                    <h2 id="news-post-title" className="text-2xl font-bold leading-snug md:text-3xl">
                      {post.title}
                    </h2>
                  </header>
                  {post.coverImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- post cover
                    <img src={post.coverImageUrl} alt="" className="max-h-[420px] w-full object-cover" />
                  )}
                  <div className="px-5 py-6 md:px-8 md:py-8">
                    <PostBody text={post.body} />
                  </div>
                  <div className="border-t border-line px-5 py-6 md:px-8">
                    <PostComments lang={lang} slug={post.slug} labels={labels.comments} />
                  </div>
                </>
              )}
            </article>

            {/* Close, post above, post below, home: like the buttons beside Steam's news window. */}
            <nav aria-label={labels.title} className="sticky top-6 flex shrink-0 flex-col gap-2">
              <button type="button" onClick={close} aria-label={labels.close} className={`${sideButton} rounded-full`}>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>
              <button type="button" onClick={() => step(-1)} disabled={index <= 0} aria-label={labels.prev} className={sideButton}>
                <svg width="16" height="10" viewBox="0 0 16 10" aria-hidden="true">
                  <path d="M1 9l7-7 7 7" fill="currentColor" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={index < 0 || index >= posts.length - 1}
                aria-label={labels.next}
                className={sideButton}
              >
                <svg width="16" height="10" viewBox="0 0 16 10" aria-hidden="true">
                  <path d="M1 1l7 7 7-7" fill="currentColor" />
                </svg>
              </button>
              <Link href={`/${lang}`} aria-label={labels.home} className={sideButton}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the site's own icon */}
                <img src="/icon.svg" alt="" className="h-8 w-8" />
              </Link>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
