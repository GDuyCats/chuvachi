"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { adminApi, AdminApiError } from "@/lib/admin-api";
import { useAdminI18n } from "./AdminI18n";
import { useToast } from "./Toast";

export const MAX_PRODUCT_PHOTOS = 8; // same limit as the server
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

type Props = {
  value: string[]; // photo URLs in display order; the first one is the cover
  onChange: (images: string[]) => void;
  invalid?: boolean;
  saveLabel: string; // name of the button that makes the photos live, e.g. "Save product"
};

// Several product photos: upload many at once, reorder, choose the cover, remove.
// Changes are only used on the shop after the admin presses the Save button.
export function ImageGalleryField({ value, onChange, invalid = false, saveLabel }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { t } = useAdminI18n();
  const m = t.images;
  const [pending, setPending] = useState(0); // photos still uploading
  const [changed, setChanged] = useState(false);
  // Always the newest list, so photos finishing one after another don't overwrite each other.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const uploading = pending > 0;
  const spaceLeft = MAX_PRODUCT_PHOTOS - value.length;
  const unsavedText = m.unsaved.replace("{button}", saveLabel);

  function errorText(error: unknown): string {
    const code = error instanceof AdminApiError ? error.code : "UNKNOWN";
    if (code === "FILE_TOO_LARGE") return m.tooLarge;
    if (code === "UNSUPPORTED_IMAGE") return m.badType;
    if (code === "STORAGE_NOT_CONFIGURED") return m.notConfigured;
    if (code === "TOO_MANY_REQUESTS") return m.tooMany;
    return m.failed;
  }

  async function addFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    const accepted = files.filter((file) => PHOTO_TYPES.includes(file.type) && file.size <= MAX_PHOTO_BYTES);
    if (accepted.length < files.length) toast.error(m.someSkipped);
    const queue = accepted.slice(0, Math.max(0, spaceLeft));
    if (accepted.length > queue.length) toast.error(m.tooManyPhotos.replace("{max}", String(MAX_PRODUCT_PHOTOS)));
    if (queue.length === 0) return;

    // Upload one by one so a phone on a slow connection isn't overloaded.
    let current = latest.current;
    let uploaded = 0;
    setPending(queue.length);
    for (const file of queue) {
      try {
        const { url } = await adminApi.uploadImage("product", file);
        current = [...current, url];
        onChange(current);
        uploaded += 1;
      } catch (error) {
        if (error instanceof AdminApiError && error.status === 401) {
          router.replace("/admin/login");
          return;
        }
        toast.error(`${file.name}: ${errorText(error)}`);
      } finally {
        setPending((count) => count - 1);
      }
    }
    if (uploaded > 0) {
      setChanged(true);
      toast.success(`${m.uploadedCount.replace("{count}", String(uploaded))} ${unsavedText}`);
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [photo] = next.splice(from, 1);
    next.splice(to, 0, photo);
    onChange(next);
    setChanged(true);
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
    setChanged(true);
  }

  const smallButton =
    "flex h-9 min-w-9 items-center justify-center bg-white/95 px-2 text-sm font-bold text-black shadow-sm disabled:opacity-30";

  return (
    <div className={`flex flex-col gap-3 ${invalid ? "outline outline-2 outline-offset-4 outline-black" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">
          {m.galleryTitle} ({value.length}/{MAX_PRODUCT_PHOTOS})
        </span>
        <span className="text-xs text-muted">{m.galleryHint}</span>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {value.map((url, index) => (
          <li key={url} className="relative aspect-square overflow-hidden bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of an uploaded photo */}
            <img src={url} alt={m.photoNumber.replace("{number}", String(index + 1))} className="h-full w-full object-cover" />
            {index === 0 && (
              <span className="absolute left-2 top-2 bg-black px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                {m.cover}
              </span>
            )}
            <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-1">
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={uploading || index === 0}
                  onClick={() => move(index, index - 1)}
                  aria-label={m.moveLeft}
                  className={smallButton}
                >
                  ←
                </button>
                <button
                  type="button"
                  disabled={uploading || index === value.length - 1}
                  onClick={() => move(index, index + 1)}
                  aria-label={m.moveRight}
                  className={smallButton}
                >
                  →
                </button>
              </div>
              <div className="flex gap-1">
                {index > 0 && (
                  <button type="button" disabled={uploading} onClick={() => move(index, 0)} className={smallButton}>
                    {m.makeCover}
                  </button>
                )}
                <button type="button" disabled={uploading} onClick={() => remove(index)} aria-label={m.remove} className={smallButton}>
                  ×
                </button>
              </div>
            </div>
          </li>
        ))}

        {Array.from({ length: pending }, (_, index) => (
          <li key={`uploading-${index}`} aria-label={m.uploading} className="aspect-square bg-[#ebebeb] motion-safe:animate-pulse" />
        ))}

        {spaceLeft - pending > 0 && (
          <li>
            <label
              className={`flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 border-[1.5px] border-dashed border-black p-3 text-center text-sm font-bold hover:bg-surface ${uploading ? "pointer-events-none opacity-50" : ""}`}
            >
              <span aria-hidden="true" className="text-3xl leading-none">
                +
              </span>
              {uploading ? m.uploading : value.length === 0 ? m.upload : m.addMore}
              <input
                type="file"
                multiple
                accept={PHOTO_TYPES.join(",")}
                className="sr-only"
                disabled={uploading}
                onChange={(ev) => {
                  void addFiles(ev.target.files);
                  ev.target.value = ""; // allow picking the same files again
                }}
              />
            </label>
          </li>
        )}
      </ul>

      <span className="text-xs text-muted">{m.productHint}</span>
      {changed && !uploading && <span className="text-xs font-semibold">{unsavedText}</span>}
    </div>
  );
}
