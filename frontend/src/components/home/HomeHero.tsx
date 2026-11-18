"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type TouchEvent } from "react";
import type { Locale } from "@/i18n/config";
import type { HeroSlideView } from "@/lib/api";
import {
  ALIGN,
  asAlign,
  DEFAULT_MOBILE_POINT,
  DEFAULT_POINT,
  focusStyle,
  frameStyle,
  pointOf,
  pointVars,
  shadeAt,
  asSplitAlign,
  splitGapPx,
  SPLIT_JUSTIFY_MD,
  textScaleStyle,
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
    "flex h-11 w-11 items-center justify-center border-[1.5px] border-hero-ink text-hero-ink hover:bg-hero-ink hover:text-hero";

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
      className="relative overflow-hidden bg-hero text-hero-ink"
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
          const desktopPoint = pointOf(slide.textX, slide.textY, DEFAULT_POINT);
          const mobilePoint = pointOf(slide.textXMobile, slide.textYMobile, DEFAULT_MOBILE_POINT);
          const align = asAlign(slide.textAlign);
          const splitAlign = asSplitAlign(slide.splitAlign);
          // Box for a full-width photo, inset by the dark frame chosen in the admin (none = edge to edge).
          const framed = "absolute overflow-hidden [inset:var(--frame-m)] md:[inset:var(--frame-d)]";
          const frame = frameStyle(slide.imagePadding) as CSSProperties;
          const sizes = textScaleStyle(slide.titleScale, slide.bodyScale) as CSSProperties;
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
                className={`relative col-start-1 row-start-1 min-h-[480px] overflow-hidden text-white md:min-h-[560px] ${motion}`}
                style={{ ...frame, ...sizes, ...(pointVars(desktopPoint, mobilePoint) as CSSProperties) }}
              >
                <div className={framed}>
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
                <div className={`${framed} md:hidden`} style={{ background: shadeAt(mobilePoint) }} aria-hidden="true" />
                <div className={`${framed} hidden md:block`} style={{ background: shadeAt(desktopPoint) }} aria-hidden="true" />
                {/* Free area for the texts: inside the photo (frame included), clear of the slide buttons. */}
                <div className="absolute [inset:calc(var(--frame-m)+2.5rem)_calc(var(--frame-m)+1rem)] md:[inset:calc(var(--frame-d)+3.5rem)_calc(var(--frame-d)+3.5rem)_calc(var(--frame-d)+6rem)]">
                <div
                  className={`absolute flex w-max max-w-[min(36rem,100%)] flex-col gap-4 [left:var(--tx-m)] [top:var(--ty-m)] [transform:translate(calc(var(--tx-m)*-1),calc(var(--ty-m)*-1))] [text-shadow:0_1px_12px_rgba(0,0,0,0.35)] md:[left:var(--tx-d)] md:[top:var(--ty-d)] md:[transform:translate(calc(var(--tx-d)*-1),calc(var(--ty-d)*-1))] ${ALIGN[align]}`}
                >
                  {slide.eyebrow && <span className="text-[calc(13px*var(--body-s,1))] font-bold uppercase tracking-[0.16em]">{slide.eyebrow}</span>}
                  <Heading className="break-words font-display text-[calc(3rem*var(--title-s,1))] uppercase leading-[1.05] md:text-[calc(4.5rem*var(--title-s,1))]">{slide.title}</Heading>
                  {slide.subtitle && <p className="text-[calc(15px*var(--body-s,1))] font-semibold md:text-[calc(17px*var(--body-s,1))]">{slide.subtitle}</p>}
                  <Link
                    href={href}
                    {...linkProps}
                    className="mt-2 bg-white px-10 py-3.5 text-[calc(15px*var(--body-s,1))] font-bold text-black [text-shadow:none] hover:bg-[#e5e5e5]"
                  >
                    {slide.cta ?? labels.heroCta}
                  </Link>
                </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={i}
              {...slideProps}
              className={`col-start-1 row-start-1 flex flex-col gap-8 px-4 py-12 md:items-center md:gap-[var(--split-gap)] md:px-14 md:py-20 ${
                slide.imageSide === "left" ? "md:flex-row-reverse" : "md:flex-row"
              } ${SPLIT_JUSTIFY_MD[splitAlign]} ${motion}`}
              style={{
                ...(widthStyle(slide.imageWidth) as CSSProperties),
                ...sizes,
                ...({ "--split-gap": `${splitGapPx(slide.splitGap)}px` } as CSSProperties),
              }}
            >
              <div className={`flex max-w-xl flex-col gap-4 ${splitAlign === "spread" ? "flex-1" : "flex-1 md:flex-initial"}`}>
                {slide.eyebrow && <span className="text-[calc(13px*var(--body-s,1))] font-bold uppercase tracking-[0.16em]">{slide.eyebrow}</span>}
                <Heading className="break-words font-display text-[calc(3rem*var(--title-s,1))] uppercase leading-[1.05] md:text-[calc(4.5rem*var(--title-s,1))]">{slide.title}</Heading>
                {slide.subtitle && <p className="text-[calc(15px*var(--body-s,1))] font-semibold md:text-[calc(17px*var(--body-s,1))]">{slide.subtitle}</p>}
                <Link
                  href={href}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="mt-2 self-start bg-hero-ink px-10 py-3.5 text-[calc(15px*var(--body-s,1))] font-bold text-hero hover:opacity-85"
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
                <span className={`block h-2 rounded-full bg-hero-ink transition-all ${i === index ? "w-6" : "w-2 opacity-40"}`} />
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
