"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { formatPrice } from "@/lib/format";
import type { SearchIndex } from "@/lib/search-index";
import { matchScore, queryWords } from "@/lib/search-text";

type Props = {
  lang: Locale;
  index: SearchIndex;
  labels: Dictionary["search"];
};

type Result = { key: string; href: string; title: string; detail: string | null; imageUrl?: string | null; tag?: string | null };

const MAX_PRODUCTS = 8;

// Magnifier button in the header that opens a search over cakes, flavors, categories, the
// season, coming-soon items and the main pages. Works without accents ("dau" finds "dâu").
// It reads the current address (usePathname), so it sits inside <Suspense>: pages can then be
// built ahead of time, with a plain magnifier shown until the search is ready.
export function SiteSearch(props: Props) {
  return (
    <Suspense
      fallback={
        <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center text-ink">
          <SearchIcon />
        </span>
      }
    >
      <SearchBox {...props} />
    </Suspense>
  );
}

function SearchBox({ lang, index, labels }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Close when the page changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // "/" opens the search (unless typing somewhere); Escape closes it.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "/" && !typing && !open) {
        event.preventDefault();
        setOpen(true);
      } else if (event.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus the box and stop the page behind from scrolling while open.
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const words = useMemo(() => queryWords(query), [query]);

  const groups = useMemo((): { title: string; results: Result[] }[] => {
    const statusTag = (value: string) =>
      value === "SOLD_OUT" ? labels.outOfStock : value === "COMING_SOON" ? labels.comingSoon : null;

    if (words.length === 0) {
      return [
        {
          title: labels.groups.categories,
          results: index.categories.map<Result>((c) => ({
            key: `c-${c.slug}`,
            href: `/${lang}/menu?category=${encodeURIComponent(c.slug)}`,
            title: c.name,
            detail: null,
          })),
        },
        {
          title: labels.groups.pages,
          results: index.pages.map<Result>((p) => ({ key: `p-${p.href}`, href: p.href, title: p.label, detail: null })),
        },
      ].filter((group) => group.results.length > 0);
    }

    const products = index.products
      .map((p) => {
        const flavorHit = p.flavors.find((f) => matchScore(words, [f]) > 0) ?? null;
        return {
          score: matchScore(words, [p.name, p.flavors.join(" "), p.category, p.description]),
          result: {
            key: `p-${p.slug}`,
            href: `/${lang}/menu/${p.slug}`,
            title: p.name,
            detail: flavorHit
              ? labels.hasFlavor.replace("{flavor}", flavorHit)
              : `${p.category} · ${labels.from} ${formatPrice(p.price, lang)}`,
            imageUrl: p.imageUrl,
            tag: statusTag(p.availability),
          } satisfies Result,
        };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_PRODUCTS)
      .map((row) => row.result);

    const categories = index.categories
      .filter((c) => matchScore(words, [c.name, c.slug]) > 0)
      .map<Result>((c) => ({
        key: `c-${c.slug}`,
        href: `/${lang}/menu?category=${encodeURIComponent(c.slug)}`,
        title: c.name,
        detail: labels.categoryDetail,
      }));

    const season: Result[] =
      index.season && matchScore(words, [index.season.name, index.season.eyebrow, labels.seasonWords]) > 0
        ? [
            {
              key: "season",
              href: `/${lang}#seasonal`,
              title: index.season.name,
              detail: labels.seasonDetail.replace("{count}", String(index.season.productSlugs.length)),
            } satisfies Result,
          ]
        : [];

    const comingSoon = index.comingSoon
      .filter((item) => matchScore(words, [item.name, item.note, labels.comingSoonWords]) > 0)
      .map<Result>((item) => ({
        key: `s-${item.name}`,
        href: `/${lang}#coming-soon`,
        title: item.name,
        detail: item.dateLabel,
        tag: labels.comingSoon,
      }));

    const pages = index.pages
      .filter((p) => matchScore(words, [p.label, p.keywords]) > 0)
      .map<Result>((p) => ({ key: `p-${p.href}`, href: p.href, title: p.label, detail: null }));

    return [
      { title: labels.groups.cakes, results: products },
      { title: labels.groups.categories, results: categories },
      { title: labels.groups.season, results: [...season, ...comingSoon] },
      { title: labels.groups.pages, results: pages },
    ].filter((group) => group.results.length > 0);
  }, [words, index, lang, labels]);

  const first = groups[0]?.results[0];
  const nothing = words.length > 0 && groups.length === 0;

  function go(href: string) {
    setOpen(false);
    if (href.startsWith("#")) {
      document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
    } else {
      router.push(href);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={labels.open}
        className="flex h-11 w-11 items-center justify-center text-ink"
      >
        <SearchIcon />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={labels.open}
            onClick={(event) => event.stopPropagation()}
            className="mx-auto flex max-h-full w-full max-w-2xl flex-col bg-white md:mt-16 md:max-h-[75vh] md:border-[1.5px] md:border-black"
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (first) go(first.href);
              }}
              className="flex items-center gap-2 border-b-[1.5px] border-black px-4"
            >
              <SearchIcon />
              <input
                ref={input}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={labels.placeholder}
                aria-label={labels.placeholder}
                enterKeyHint="search"
                className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none"
              />
              <button type="button" onClick={() => setOpen(false)} className="py-2 text-sm font-semibold underline">
                {labels.close}
              </button>
            </form>

            <div className="overflow-y-auto px-4 pb-6">
              {nothing && <p className="py-8 text-center text-muted">{labels.nothing.replace("{query}", query.trim())}</p>}
              {words.length === 0 && <p className="pt-4 text-sm text-muted">{labels.hint}</p>}
              {groups.map((group) => (
                <section key={group.title} className="flex flex-col pt-5">
                  <h2 className="pb-2 text-xs font-bold uppercase tracking-widest text-muted">{group.title}</h2>
                  <ul className="flex flex-col">
                    {group.results.map((result) => (
                      <li key={result.key}>
                        <Link
                          href={result.href}
                          onClick={(event) => {
                            event.preventDefault();
                            go(result.href);
                          }}
                          className="flex min-h-12 items-center gap-3 border-b border-line py-2.5 hover:bg-surface"
                        >
                          {result.imageUrl !== undefined && (
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden bg-surface">
                              {result.imageUrl && (
                                // eslint-disable-next-line @next/next/no-img-element -- small search thumbnail
                                <img src={result.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                              )}
                            </span>
                          )}
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate font-semibold">{result.title}</span>
                            {result.detail && <span className="truncate text-sm text-muted">{result.detail}</span>}
                          </span>
                          {result.tag && (
                            <span className="shrink-0 border border-black px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                              {result.tag}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SearchIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" strokeLinecap="round" />
    </svg>
  );
}
