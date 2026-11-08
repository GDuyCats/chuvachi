"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { Dictionary } from "@/i18n/dictionaries";

type PhotoLabels = Dictionary["reviews"]["photos"];

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

// Small square photos; tapping one opens it full screen.
export function PhotoGrid({ photos, labels, size = "md" }: { photos: string[]; labels: PhotoLabels; size?: "sm" | "md" }) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  if (photos.length === 0) return null;
  const box = size === "sm" ? "h-20 w-20" : "h-24 w-24 md:h-28 md:w-28";
  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {photos.map((url, index) => (
          <li key={url}>
            <button
              type="button"
              onClick={() => setOpenAt(index)}
              aria-label={fill(labels.open, { number: index + 1 })}
              className={`block overflow-hidden border border-line ${box}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- customer photo, already resized by the server */}
              <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      {openAt !== null && <Lightbox photos={photos} start={openAt} labels={labels} onClose={() => setOpenAt(null)} />}
    </>
  );
}

function Lightbox({ photos, start, labels, onClose }: { photos: string[]; start: number; labels: PhotoLabels; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const many = photos.length > 1;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // the page behind does not scroll
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key === "ArrowRight") setIndex((i) => (i + 1) % photos.length);
      if (event.key === "ArrowLeft") setIndex((i) => (i - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [photos.length]);

  const iconButton = "flex h-11 w-11 items-center justify-center bg-white text-black";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.alt}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose(); // tap outside the photo
      }}
    >
      <button ref={closeRef} type="button" onClick={onClose} aria-label={labels.close} className={`absolute right-4 top-4 ${iconButton}`}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M3 3l12 12M15 3L3 15" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- customer photo */}
      <img src={photos[index]} alt={labels.alt} className="max-h-[80vh] max-w-full object-contain" />
      {many && (
        <div className="flex items-center gap-4 text-white">
          <button type="button" onClick={() => setIndex((i) => (i - 1 + photos.length) % photos.length)} aria-label={labels.prev} className={iconButton}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10 2L4 8l6 6" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          <span className="min-w-12 text-center text-sm font-bold">{fill(labels.position, { number: index + 1, total: photos.length })}</span>
          <button type="button" onClick={() => setIndex((i) => (i + 1) % photos.length)} aria-label={labels.next} className={iconButton}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6 2l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

type PickerProps = {
  photos: string[];
  onChange: (photos: string[]) => void;
  max: number;
  upload: (file: File) => Promise<string>; // returns the stored photo's URL
  labels: PhotoLabels;
  errorText: (error: unknown) => string;
  onBusyChange?: (busy: boolean) => void;
};

// Chosen photos with a remove button each, and an "add" button while there is room.
export function PhotoPicker({ photos, onChange, max, upload, labels, errorText, onBusyChange }: PickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const room = max - photos.length;

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, room);
    event.target.value = ""; // the same file can be picked again later
    if (files.length === 0) return;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    const added: string[] = [];
    try {
      for (const file of files) added.push(await upload(file));
    } catch (err) {
      setError(errorText(err));
    } finally {
      if (added.length > 0) onChange([...photos, ...added]);
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {photos.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {photos.map((url) => (
            <li key={url} className="relative h-20 w-20 border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element -- preview of an uploaded photo */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onChange(photos.filter((p) => p !== url))}
                aria-label={labels.remove}
                className="absolute right-0 top-0 flex h-7 w-7 items-center justify-center bg-black text-white"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      {room > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="flex min-h-10 items-center gap-2 border-[1.5px] border-black px-3 text-sm font-bold disabled:opacity-50"
          >
            <svg width="18" height="16" viewBox="0 0 18 16" aria-hidden="true">
              <path d="M1.5 4.5h3l1.5-2h6l1.5 2h3v10h-15z" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="9" cy="9" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            {busy ? labels.uploading : max === 1 ? labels.addOne : labels.add}
          </button>
          {max > 1 && <span className="text-xs text-muted">{fill(labels.limit, { count: max })}</span>}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple={max > 1} hidden onChange={pick} />
      {error && (
        <p role="status" className="text-sm font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}
