"use client";

import Image from "next/image";
import { FadeInImage } from "../FadeInImage";
import { useRef, useState } from "react";

type Labels = {
  photoComingSoon: string;
  photoOf: string; // "Photo {number} of {total}"
  previousPhoto: string;
  nextPhoto: string;
};

type Props = {
  images: string[];
  alt: string;
  labels: Labels;
};

// Product photos: swipe on phones, arrows and thumbnails on computers.
export function ProductGallery({ images, alt, labels }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const total = images.length;

  if (total === 0) {
    return (
      <div className="flex aspect-square items-center justify-center bg-surface text-[13px] text-[#767676]">
        {labels.photoComingSoon}
      </div>
    );
  }

  function goTo(index: number) {
    const track = trackRef.current;
    if (!track) return;
    const target = Math.max(0, Math.min(total - 1, index));
    track.scrollTo({ left: target * track.clientWidth, behavior: "smooth" });
  }

  // Keep the counter and thumbnails in step with swiping.
  function handleScroll() {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setCurrent(Math.round(track.scrollLeft / track.clientWidth));
  }

  const photoLabel = (index: number) =>
    labels.photoOf.replace("{number}", String(index + 1)).replace("{total}", String(total));
  const arrow =
    "absolute top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center bg-white/90 text-xl font-bold shadow-sm hover:bg-white disabled:opacity-0 md:flex";

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <div
          ref={trackRef}
          onScroll={handleScroll}
          role="region"
          aria-roledescription="carousel"
          aria-label={alt}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") goTo(current - 1);
            if (event.key === "ArrowRight") goTo(current + 1);
          }}
          className="no-scrollbar flex aspect-square snap-x snap-mandatory overflow-x-auto bg-surface"
        >
          {images.map((src, index) => (
            <div key={src} className="relative h-full w-full shrink-0 snap-center" aria-label={photoLabel(index)} role="group">
              <FadeInImage
                src={src}
                alt={index === 0 ? alt : `${alt} (${photoLabel(index)})`}
                fill
                priority={index === 0}
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>

        {total > 1 && (
          <>
            <button type="button" onClick={() => goTo(current - 1)} disabled={current === 0} aria-label={labels.previousPhoto} className={`${arrow} left-3`}>
              ←
            </button>
            <button
              type="button"
              onClick={() => goTo(current + 1)}
              disabled={current === total - 1}
              aria-label={labels.nextPhoto}
              className={`${arrow} right-3`}
            >
              →
            </button>
            <span aria-live="polite" className="absolute bottom-3 right-3 bg-black/80 px-2.5 py-1 text-xs font-bold text-white">
              {current + 1}/{total}
            </span>
          </>
        )}
      </div>

      {total > 1 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {images.map((src, index) => (
            <button
              key={src}
              type="button"
              onClick={() => goTo(index)}
              aria-label={photoLabel(index)}
              aria-current={index === current ? "true" : undefined}
              className={`relative h-16 w-16 shrink-0 overflow-hidden border-2 transition-[opacity,border-color] duration-200 md:h-20 md:w-20 ${index === current ? "border-black" : "border-transparent opacity-70 hover:opacity-100"}`}
            >
              <Image src={src} alt="" fill sizes="80px" className="object-cover transition-opacity" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
