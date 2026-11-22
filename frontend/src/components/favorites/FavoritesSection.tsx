"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import {
  getFavoritesSnapshot,
  getServerFavoritesSnapshot,
  setNewCakeAlerts,
  subscribeToFavorites,
  syncFavorites,
  type FavoriteList,
} from "@/lib/favorites";
import { PhotoBox } from "../PhotoBox";
import { HeartButton } from "./HeartButton";

type Props = { lang: Locale; labels: Dictionary["favorites"]; productLabels: Dictionary["product"] };

// On the account page: the hearted cakes, and the "tell me about new cakes" switch.
export function FavoritesSection({ lang, labels, productLabels }: Props) {
  const [list, setList] = useState<FavoriteList | null>(null);
  const [alerts, setAlerts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // Hearts removed here disappear at once; the list only reloads when the page opens.
  const ids = useSyncExternalStore(subscribeToFavorites, getFavoritesSnapshot, getServerFavoritesSnapshot);

  useEffect(() => {
    let active = true;
    void syncFavorites(lang).then((result) => {
      if (!active) return;
      setList(result);
      setAlerts(result?.newCakeAlerts ?? false);
    });
    return () => {
      active = false;
    };
  }, [lang]);

  async function toggleAlerts(on: boolean) {
    setAlerts(on);
    setSaving(true);
    setFailed(false);
    try {
      await setNewCakeAlerts(on);
    } catch {
      setAlerts(!on);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  const items = (list?.items ?? []).filter((item) => ids.includes(item.id));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[28px] uppercase tracking-wide">{labels.title}</h2>
        <p className="text-sm text-muted">{labels.hint}</p>
      </div>

      {list === null ? null : items.length === 0 ? (
        <p className="border border-dashed border-[#a8a8a8] p-6 text-center text-sm text-muted">
          {labels.empty}{" "}
          <Link href={`/${lang}/menu`} className="font-semibold text-ink underline">
            {labels.browse}
          </Link>
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {items.map((item) => (
            <li key={item.id} className="relative">
              <Link href={`/${lang}/menu/${item.slug}`} className="flex flex-col gap-2 rounded-xl bg-surface p-3">
                <PhotoBox
                  src={item.imageUrl}
                  alt={item.name}
                  fallbackText={productLabels.photoComingSoon}
                  className={`aspect-square ${item.availability !== "AVAILABLE" ? "opacity-60" : ""}`}
                />
                <span className="text-sm font-semibold leading-snug">{item.name}</span>
                {item.availability !== "AVAILABLE" && (
                  <span className="text-xs text-muted">
                    {item.availability === "COMING_SOON" ? productLabels.comingSoon : productLabels.outOfStock}
                  </span>
                )}
              </Link>
              <HeartButton
                productId={item.id}
                name={item.name}
                labels={{ add: productLabels.favoriteAdd, remove: productLabels.favoriteRemove }}
                className="absolute right-5 top-5"
              />
            </li>
          ))}
        </ul>
      )}

      <label className="flex min-h-12 items-start gap-3 border-[1.5px] border-black p-4">
        <input
          type="checkbox"
          role="switch"
          checked={alerts}
          disabled={saving || list === null}
          onChange={(event) => void toggleAlerts(event.target.checked)}
          className="switch mt-0.5"
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold">{labels.newCakes}</span>
          <span className="text-sm text-muted">{labels.newCakesHint}</span>
        </span>
      </label>
      {failed && (
        <p role="alert" className="text-sm font-semibold">
          {labels.saveFailed}
        </p>
      )}
    </section>
  );
}
