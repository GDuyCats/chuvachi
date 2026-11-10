"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import type { Locale } from "@/i18n/config";
import type { HeroSlideView } from "@/lib/api";
import { FadeInImage } from "../FadeInImage";

type Labels = {
  heroCta: string; // button text when a slide has none
  heroPrev: string;
  heroNext: string;
  heroGoTo: string; // "Banner {number}"
  heroPause: string;
  heroPlay: string;
  heroSlideOf: string; // "{number} of {total}" (screen readers)
};

type Props = {
  lang: Locale;
  slides: HeroSlideView[];
  intervalSeconds: number;
  labels: Labels;
};

function fill(template: string, values: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

// Full-width dark banner. With several slides it moves to the next one every few seconds
// (cross-fade), pauses while the pointer or keyboard focus is on it, and can be swiped on phones.
// All slides share one grid cell, so the banner keeps the height of the tallest slide.
export function HomeHero({ lang, slides, intervalSeconds, labels }: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false); // the pause button
  const [hovered, setHovered] = useState(false); // pointer or focus inside
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchStart = useRef<number | null>(null);
  const many = slides.length > 1;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const go = useCallback(
    (next: number) => setIndex(((next % slides.length) + slides.length) % slides.length),
    [slides.length],
  );

  // Auto-play: not for people who asked for less motion, and not while paused or hovered.
  useEffect(() => {
    if (!many || paused || hovered || reducedMotion) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setIndex((i) => (i + 1) % slides.length);
    }, Math.max(3, intervalSeconds) * 1000);
    return () => window.clearInterval(timer);
  }, [many, paused, hovered, reducedMotion, intervalSeconds, slides.length]);

  function onTouchEnd(event: TouchEvent) {
    if (touchStart.current === null) return;
    const dx = event.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
  }

  const iconButton =
    "flex h-11 w-11 items-center justify-center border-[1.5px] border-white text-white hover:bg-white hover:text-black";

  return (
    <section
      id="new"
      aria-roledescription={many ? "carousel" : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovered(false);
      }}
      onTouchStart={(event) => {
        touchStart.current = event.touches[0].clientX;
      }}
      onTouchEnd={onTouchEnd}
      className="relative overflow-hidden bg-[#141414] text-white"
    >
      <div className="grid">
        {slides.map((slide, i) => {
          const active = i === index;
          const href = slide.productSlug ? `/${lang}/menu/${slide.productSlug}` : `/${lang}/menu`;
          const Heading = i === 0 ? "h1" : "h2"; // one main heading per page
          return (
            <div
              key={i}
              role={many ? "group" : undefined}
              aria-roledescription={many ? "slide" : undefined}
              aria-label={many ? fill(labels.heroSlideOf, { number: i + 1, total: slides.length }) : undefined}
              inert={!active}
              className={`col-start-1 row-start-1 flex flex-col gap-8 px-4 py-12 md:flex-row md:items-center md:px-14 md:py-20 ${
                reducedMotion ? "" : "transition-[opacity,transform] duration-700 ease-out"
              } ${active ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-6 opacity-0"}`}
            >
              <div className="flex max-w-xl flex-1 flex-col gap-4">
                {slide.eyebrow && <span className="text-[13px] font-bold uppercase tracking-[0.16em]">{slide.eyebrow}</span>}
                <Heading className="font-display text-5xl uppercase leading-[1.05] md:text-7xl">{slide.title}</Heading>
                {slide.subtitle && <p className="text-[15px] font-semibold md:text-[17px]">{slide.subtitle}</p>}
                <Link href={href} className="mt-2 self-start bg-white px-10 py-3.5 text-[15px] font-bold text-black hover:bg-[#e5e5e5]">
                  {slide.cta ?? labels.heroCta}
                </Link>
              </div>

              {slide.imageUrl && (
                <div className="relative aspect-[4/3] flex-1 overflow-hidden md:aspect-[16/11]">
                  <FadeInImage
                    src={slide.imageUrl}
                    alt={slide.title}
                    fill
                    priority={i === 0}
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {many && (
        <div className="flex items-center gap-3 px-4 pb-8 md:absolute md:bottom-8 md:left-14 md:px-0 md:pb-0">
          <button type="button" onClick={() => go(index - 1)} aria-label={labels.heroPrev} className={iconButton}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M9 1.5L3.5 7 9 12.5" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                aria-label={fill(labels.heroGoTo, { number: i + 1 })}
                aria-current={i === index ? "true" : undefined}
                className="flex h-11 w-6 items-center justify-center"
              >
                <span className={`block h-2 rounded-full bg-white transition-all ${i === index ? "w-6" : "w-2 opacity-40"}`} />
              </button>
            ))}
          </div>
          <button type="button" onClick={() => go(index + 1)} aria-label={labels.heroNext} className={iconButton}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M5 1.5L10.5 7 5 12.5" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          {!reducedMotion && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? labels.heroPlay : labels.heroPause}
              aria-pressed={paused}
              className={iconButton}
            >
              {paused ? (
                <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
                  <path d="M1 1l10 6-10 6z" fill="currentColor" />
                </svg>
              ) : (
                <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
                  <path d="M2 1v12M10 1v12" stroke="currentColor" strokeWidth="2.5" />
                </svg>
              )}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
