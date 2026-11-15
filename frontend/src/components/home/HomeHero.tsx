"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type TouchEvent } from "react";
import type { Locale } from "@/i18n/config";
import type { HeroSlideView } from "@/lib/api";
import {
  ALIGN,
  asPosition,
  DEFAULT_MOBILE_POSITION,
  DEFAULT_POSITION,
  focusStyle,
  frameStyle,
  PLACE,
  PLACE_MD,
  shadeFor,
  type TextAlign,
  widthStyle,
} from "@/lib/hero-layout";
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

// Where a slide goes: its own link (a page of this site or another site), else its cake, else the menu.
function slideHref(slide: HeroSlideView, lang: Locale): string {
  if (slide.linkUrl) return slide.linkUrl.startsWith("/") ? `/${lang}${slide.linkUrl}` : slide.linkUrl;
  return slide.productSlug ? `/${lang}/menu/${slide.productSlug}` : `/${lang}/menu`;
}

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
          const href = slideHref(slide, lang);
          const external = href.startsWith("http");
          const Heading = i === 0 ? "h1" : "h2"; // one main heading per page
          const slideProps = {
            role: many ? "group" : undefined,
            "aria-roledescription": many ? "slide" : undefined,
            "aria-label": many ? fill(labels.heroSlideOf, { number: i + 1, total: slides.length }) : undefined,
            inert: !active,
          };
          const focus = focusStyle(slide.focusX, slide.focusY);
          const desktopPos = asPosition(slide.textPosition, DEFAULT_POSITION);
          const mobilePos = asPosition(slide.textPositionMobile, DEFAULT_MOBILE_POSITION);
          const align: TextAlign = slide.textAlign === "center" || slide.textAlign === "right" ? slide.textAlign : "left";
          // Box for a full-width photo, inset by the dark frame chosen in the admin (none = edge to edge).
          const framed = "absolute overflow-hidden [inset:var(--frame-m)] md:[inset:var(--frame-d)]";
          const frame = frameStyle(slide.imagePadding) as CSSProperties;
          const motion = `${reducedMotion ? "" : "transition-[opacity,transform] duration-700 ease-out"} ${
            active ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-6 opacity-0"
          }`;

          // Just the photo, edge to edge; the whole banner is the link.
          if (slide.imageOnly && slide.imageUrl) {
            return (
              <div key={i} {...slideProps} className={`relative col-start-1 row-start-1 ${motion}`}>
                {slide.title && <Heading className="sr-only">{slide.title}</Heading>}
                <Link
                  href={href}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  aria-label={slide.title || slide.cta || labels.heroCta}
                  className="relative block h-full w-full"
                >
                  {/* Sets the height when this is the only slide; taller slides beside it stretch it. */}
                  <div className="aspect-[4/3] md:aspect-[21/9]" aria-hidden="true" />
                  <div className={framed} style={frame}>
                    <FadeInImage
                      src={slide.imageUrl}
                      alt={slide.title}
                      fill
                      priority={i === 0}
                      quality={90}
                      sizes="100vw"
                      className="object-cover"
                      style={focus}
                    />
                  </div>
                </Link>
              </div>
            );
          }

          const linkProps = external ? { target: "_blank", rel: "noopener noreferrer" } : {};

          // The photo fills the banner and the texts sit on it, over a dark fade so they stay readable.
          if (slide.textOverlay && slide.imageUrl) {
            return (
              <div
                key={i}
                {...slideProps}
                className={`relative col-start-1 row-start-1 flex min-h-[480px] overflow-hidden px-4 py-12 md:min-h-[560px] md:px-14 md:py-20 ${PLACE[mobilePos]} ${PLACE_MD[desktopPos]} ${motion}`}
              >
                <div className={framed} style={frame}>
                  <FadeInImage
                    src={slide.imageUrl}
                    alt=""
                    fill
                    priority={i === 0}
                    quality={90}
                    sizes="100vw"
                    className="object-cover"
                    style={focus}
                  />
                </div>
                {/* Dark fade on the side of the texts: one for phones, one for computers. */}
                <div className="absolute inset-0 md:hidden" style={{ background: shadeFor(mobilePos) }} aria-hidden="true" />
                <div className="absolute inset-0 hidden md:block" style={{ background: shadeFor(desktopPos) }} aria-hidden="true" />
                <div className={`relative flex max-w-xl flex-col gap-4 [text-shadow:0_1px_12px_rgba(0,0,0,0.35)] ${ALIGN[align]}`}>
                  {slide.eyebrow && <span className="text-[13px] font-bold uppercase tracking-[0.16em]">{slide.eyebrow}</span>}
                  <Heading className="font-display text-5xl uppercase leading-[1.05] md:text-7xl">{slide.title}</Heading>
                  {slide.subtitle && <p className="text-[15px] font-semibold md:text-[17px]">{slide.subtitle}</p>}
                  <Link
                    href={href}
                    {...linkProps}
                    className="mt-2 bg-white px-10 py-3.5 text-[15px] font-bold text-black [text-shadow:none] hover:bg-[#e5e5e5]"
                  >
                    {slide.cta ?? labels.heroCta}
                  </Link>
                </div>
              </div>
            );
          }

          return (
            <div
              key={i}
              {...slideProps}
              className={`col-start-1 row-start-1 flex flex-col gap-8 px-4 py-12 md:flex-row md:items-center md:px-14 md:py-20 ${motion}`}
              style={widthStyle(slide.imageWidth) as CSSProperties}
            >
              <div className="flex max-w-xl flex-1 flex-col gap-4">
                {slide.eyebrow && <span className="text-[13px] font-bold uppercase tracking-[0.16em]">{slide.eyebrow}</span>}
                <Heading className="font-display text-5xl uppercase leading-[1.05] md:text-7xl">{slide.title}</Heading>
                {slide.subtitle && <p className="text-[15px] font-semibold md:text-[17px]">{slide.subtitle}</p>}
                <Link
                  href={href}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="mt-2 self-start bg-white px-10 py-3.5 text-[15px] font-bold text-black hover:bg-[#e5e5e5]"
                >
                  {slide.cta ?? labels.heroCta}
                </Link>
              </div>

              {slide.imageUrl && (
                <div className="relative aspect-[4/3] flex-1 overflow-hidden md:aspect-[16/11] md:flex-none md:basis-[var(--photo-w)]">
                  <FadeInImage
                    src={slide.imageUrl}
                    alt={slide.title}
                    fill
                    priority={i === 0}
                    quality={90}
                    sizes="(min-width: 768px) 70vw, 100vw"
                    className="object-cover"
                    style={focus}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {many && (
        <div className="flex items-center gap-3 px-4 pb-8 md:absolute md:bottom-8 md:left-14 md:z-10 md:px-0 md:pb-0">
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
