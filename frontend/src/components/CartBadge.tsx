"use client";

import { useSyncExternalStore } from "react";
import { cartItemCount, readCart, subscribeToCart } from "@/lib/cart";

function getCount(): number {
  return cartItemCount(readCart());
}

// Small number on the cart icon. Shows nothing while the page renders on the server.
export function CartBadge() {
  const count = useSyncExternalStore(subscribeToCart, getCount, () => 0);
  if (count === 0) return null;

  return (
    // A new key on every change replays the little "bump" animation.
    <span
      key={count}
      className="animate-badge-bump absolute right-0 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-black px-1 text-[11px] font-bold text-white"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
