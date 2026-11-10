"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminApi, AdminApiError, type UploadKind } from "@/lib/admin-api";
import { useAdminI18n } from "./AdminI18n";
import { useToast } from "./Toast";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // same limit as the server
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

type Props = {
  kind: UploadKind; // "product" (square photo) or "banner" (wide homepage photo)
  value: string | null;
  onChange: (url: string | null) => void;
  invalid?: boolean;
  saveLabel: string; // name of the button that makes the photo live, e.g. "Save product"
};

// Upload, preview, replace or remove a photo.
// The new photo is only used on the shop after the admin presses the Save button.
export function ImageUploadField({ kind, value, onChange, invalid = false, saveLabel }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { t } = useAdminI18n();
  const m = t.images;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const unsavedText = m.unsaved.replace("{button}", saveLabel);

  function fail(text: string) {
    setError(text);
    toast.error(text);
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!PHOTO_TYPES.includes(file.type)) return fail(m.badType);
    if (file.size > MAX_PHOTO_BYTES) return fail(m.tooLarge);

    setUploading(true);
    try {
      const { url } = await adminApi.uploadImage(kind, file);
      onChange(url);
      setChanged(true);
      toast.success(`${m.uploaded} ${unsavedText}`);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const code = err instanceof AdminApiError ? err.code : "UNKNOWN";
      fail(
        code === "FILE_TOO_LARGE"
          ? m.tooLarge
          : code === "UNSUPPORTED_IMAGE"
            ? m.badType
            : code === "STORAGE_NOT_CONFIGURED"
              ? m.notConfigured
              : code === "TOO_MANY_REQUESTS"
                ? m.tooMany
                : m.failed,
      );
    } finally {
      setUploading(false);
    }
  }

  const previewShape = kind !== "product" ? "aspect-[16/9] w-full max-w-sm" : "aspect-square w-40";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div
        className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-surface text-xs text-muted ${previewShape} ${invalid ? "outline outline-2 outline-black" : ""}`}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin preview of an uploaded photo
          <img src={value} alt="" className={`h-full w-full object-cover ${uploading ? "opacity-40" : ""}`} />
        ) : (
          !uploading && m.none
        )}
        {uploading && <div aria-hidden="true" className="absolute inset-0 bg-[#ebebeb] motion-safe:animate-pulse" />}
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">{kind !== "product" ? m.bannerTitle : m.productTitle}</span>
        <div className="flex flex-wrap gap-2">
          <label
            className={`flex min-h-11 cursor-pointer items-center border-[1.5px] border-black px-4 text-sm font-bold ${uploading ? "pointer-events-none opacity-60" : ""}`}
          >
            {uploading ? m.uploading : value ? m.change : m.upload}
            <input
              type="file"
              accept={PHOTO_TYPES.join(",")}
              className="sr-only"
              disabled={uploading}
              onChange={(ev) => {
                void pick(ev.target.files?.[0]);
                ev.target.value = ""; // allow picking the same file again
              }}
            />
          </label>
          {value && !uploading && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setChanged(true);
              }}
              className="min-h-11 px-2 text-sm font-semibold underline"
            >
              {m.remove}
            </button>
          )}
        </div>
        <span className="text-xs text-muted">{kind !== "product" ? m.bannerHint : m.productHint}</span>
        {changed && !error && <span className="text-xs font-semibold">{unsavedText}</span>}
        {error && (
          <span role="alert" className="text-sm font-semibold">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
