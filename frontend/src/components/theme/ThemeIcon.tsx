import type { ReactNode } from "react";
import type { ThemeIconName } from "@/lib/site-theme";

// Small one-color line icons for seasonal looks, drawn in the text color (currentColor).
const SHAPES: Record<ThemeIconName, ReactNode> = {
  tree: (
    <>
      <path d="M12 3l5 6h-2.5l4 5.5H15l4 5.5H5l4-5.5H5.5l4-5.5H7z" />
      <path d="M12 20v2" />
    </>
  ),
  star: <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z" />,
  snowflake: (
    <>
      <path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10" />
      <path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5" />
    </>
  ),
  gift: (
    <>
      <path d="M4.5 10.5h15V21h-15zM3 7h18v3.5H3zM12 7v14" />
      <path d="M12 7C10.5 3.5 6.5 3.5 6.5 5.5S10 7 12 7zm0 0c1.5-3.5 5.5-3.5 5.5-1.5S14 7 12 7z" />
    </>
  ),
  apricot: (
    <>
      <circle cx="12" cy="7.4" r="2.9" />
      <circle cx="16.37" cy="10.58" r="2.9" />
      <circle cx="14.7" cy="15.72" r="2.9" />
      <circle cx="9.3" cy="15.72" r="2.9" />
      <circle cx="7.63" cy="10.58" r="2.9" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  envelope: (
    <>
      <path d="M5.5 2.5h13v19h-13z" />
      <path d="M5.5 2.5L12 8l6.5-5.5" />
      <circle cx="12" cy="13.5" r="2.2" />
    </>
  ),
  lantern: (
    <>
      <path d="M9 3.5h6M12 3.5V6" />
      <path d="M7 6.5h10c1.6 3.4 1.6 7.6 0 11H7c-1.6-3.4-1.6-7.6 0-11z" />
      <path d="M12 6.5v11M12 17.5v4M10.5 21.5h3" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z" />,
  heart: (
    <path d="M12 20.5l-1.3-1.2C5.6 14.7 2.5 11.9 2.5 8.4c0-2.8 2.2-4.9 4.9-4.9 1.6 0 3.1.7 4.6 2.4 1.5-1.7 3-2.4 4.6-2.4 2.7 0 4.9 2.1 4.9 4.9 0 3.5-3.1 6.3-8.2 10.9z" />
  ),
  flower: (
    <>
      <circle cx="12" cy="6.5" r="3" />
      <circle cx="17.5" cy="12" r="3" />
      <circle cx="12" cy="17.5" r="3" />
      <circle cx="6.5" cy="12" r="3" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </>
  ),
  pumpkin: (
    <>
      <path d="M12 7.5c-5 0-8.5 3-8.5 6.8S7 21 12 21s8.5-2.9 8.5-6.7S17 7.5 12 7.5z" />
      <path d="M12 7.5c-2 0-3 3-3 6.8S10 21 12 21s3-2.9 3-6.7-1-6.8-3-6.8z" />
      <path d="M12 7.5V4.5l2.2-1.2" />
    </>
  ),
  cake: (
    <>
      <path d="M4 12h16v9H4z" />
      <path d="M4 15.5c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 4 0M12 8.5V12" />
      <circle cx="12" cy="6" r="1.2" fill="currentColor" />
    </>
  ),
  tag: (
    <>
      <path d="M3 12.5V3.5h9l9 9-9 9z" />
      <circle cx="7.5" cy="8" r="1.5" />
    </>
  ),
};

export function isThemeIcon(name: string | null | undefined): name is ThemeIconName {
  return Boolean(name && Object.hasOwn(SHAPES, name));
}

export function ThemeIconSvg({ name, size = 22, className }: { name: ThemeIconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      {SHAPES[name]}
    </svg>
  );
}
