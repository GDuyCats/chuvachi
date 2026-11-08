"use client";

import { useEffect, useState } from "react";
import { isSoldOutToday } from "@/lib/shop-date";

type Props = {
  soldOutUntil: string | null | undefined;
  label: string;
  className?: string;
};

// "Sold out" label on a cake. Today's date is only checked in the browser, so cached pages
// stay correct when a sold-out period ends.
export function SoldOutBadge({ soldOutUntil, label, className = "" }: Props) {
  const [soldOut, setSoldOut] = useState(false);
  useEffect(() => {
    setSoldOut(isSoldOutToday(soldOutUntil));
  }, [soldOutUntil]);

  if (!soldOut) return null;
  return (
    <span className={`border-[1.5px] border-black bg-white px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-black ${className}`}>
      {label}
    </span>
  );
}
