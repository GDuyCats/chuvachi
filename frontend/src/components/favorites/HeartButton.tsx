"use client";

import { useState, useSyncExternalStore } from "react";
import { getFavoritesSnapshot, getServerFavoritesSnapshot, setFavorite, subscribeToFavorites } from "@/lib/favorites";

export type HeartLabels = { add: string; remove: string };

type Props = {
  productId: number;
  name: string; // the cake's name, read out with the button's label
  labels: HeartLabels;
  size?: "card" | "page";
  className?: string;
};

// The heart that saves a cake to the visitor's favorites. Filled in the theme's accent color.
export function HeartButton({ productId, name, labels, size = "card", className = "" }: Props) {
  const ids = useSyncExternalStore(subscribeToFavorites, getFavoritesSnapshot, getServerFavoritesSnapshot);
  const on = ids.includes(productId);
  const [bump, setBump] = useState(0); // replays the small "pop" each time it is hearted

  const box = size === "page" ? "h-12 w-12 border-[1.5px] border-black" : "h-10 w-10 rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.18)]";
  const icon = size === "page" ? 24 : 20;

  return (
    <button
      type="button"
      onClick={(event) => {
        // Cards are links; the heart must not open the cake's page.
        event.preventDefault();
        event.stopPropagation();
        if (!on) setBump((value) => value + 1);
        void setFavorite(productId, !on);
      }}
      aria-pressed={on}
      aria-label={`${on ? labels.remove : labels.add}: ${name}`}
      title={on ? labels.remove : labels.add}
      className={`flex shrink-0 items-center justify-center bg-white text-black ${box} ${className}`}
    >
      <svg
        key={bump}
        width={icon}
        height={icon}
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={on && bump > 0 ? "animate-heart-pop" : ""}
      >
        <path
          d="M12 20.5l-1.3-1.2C5.6 14.7 2.5 11.9 2.5 8.4c0-2.8 2.2-4.9 4.9-4.9 1.6 0 3.1.7 4.6 2.4 1.5-1.7 3-2.4 4.6-2.4 2.7 0 4.9 2.1 4.9 4.9 0 3.5-3.1 6.3-8.2 10.9z"
          fill={on ? "var(--color-accent)" : "none"}
          stroke={on ? "var(--color-accent)" : "currentColor"}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
