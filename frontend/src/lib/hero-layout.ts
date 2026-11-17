// Where the texts of a "text on the photo" banner sit, and which part of the photo stays in view.
// Shared by the homepage banner and the admin preview so both look the same.
//
// The texts' place is a point in % of the free area (0,0 = top left, 100,100 = bottom right).
// The text block is shifted by the same % of its own size, so at 0 it touches the left edge,
// at 100 the right edge, and in between it moves smoothly: it can never stick out of the banner.

export type TextAlign = "left" | "center" | "right";
export type TextPoint = { x: number; y: number };

export const DEFAULT_POINT: TextPoint = { x: 0, y: 50 }; // middle left (computers)
export const DEFAULT_MOBILE_POINT: TextPoint = { x: 0, y: 100 }; // bottom left (phones)

// Quick choices in the admin: top / middle / bottom × left / center / right.
export const PRESETS: { key: string; point: TextPoint }[] = [0, 50, 100].flatMap((y) =>
  [0, 50, 100].map((x) => ({ key: `${y}-${x}`, point: { x, y } })),
);

const pct = (n: number | null | undefined, fallback: number) => Math.min(100, Math.max(0, n ?? fallback));

export function pointOf(x: number | null | undefined, y: number | null | undefined, fallback: TextPoint): TextPoint {
  if (x === null || x === undefined || y === null || y === undefined) return fallback;
  return { x: pct(x, fallback.x), y: pct(y, fallback.y) };
}

// Inline style placing the text block at a point of its (relative) parent.
export function pointStyle(point: TextPoint): { left: string; top: string; transform: string } {
  return { left: `${point.x}%`, top: `${point.y}%`, transform: `translate(-${point.x}%, -${point.y}%)` };
}

// The same as CSS variables, so phones and computers can use different points (see HomeHero).
export function pointVars(desktop: TextPoint, mobile: TextPoint): Record<string, string> {
  return {
    "--tx-d": `${desktop.x}%`,
    "--ty-d": `${desktop.y}%`,
    "--tx-m": `${mobile.x}%`,
    "--ty-m": `${mobile.y}%`,
  };
}

// Lines of text and the button inside the block.
export const ALIGN: Record<TextAlign, string> = {
  left: "items-start text-left",
  center: "items-center text-center",
  right: "items-end text-right",
};

export function asAlign(value: string | null | undefined): TextAlign {
  return value === "center" || value === "right" ? value : "left";
}

// A dark fade on the side where the texts are, so white text stays readable on any photo.
export function shadeAt(point: TextPoint): string {
  const fade = (direction: string) => `linear-gradient(${direction}, rgba(0,0,0,0.78), rgba(0,0,0,0.38) 45%, rgba(0,0,0,0.05))`;
  if (point.x <= 33) return fade("to right");
  if (point.x >= 67) return fade("to left");
  if (point.y <= 33) return fade("to bottom");
  if (point.y >= 67) return fade("to top");
  return "radial-gradient(ellipse at center, rgba(0,0,0,0.6), rgba(0,0,0,0.25) 75%)";
}

// The dark frame around a full-width photo: CSS variables read by the image box's inset
// (4 px per step on phones, 8 px per step on computers).
export function frameStyle(padding: number | null | undefined): Record<string, string> {
  const steps = Math.min(12, Math.max(0, padding ?? 0));
  return { "--frame-m": `${steps * 4}px`, "--frame-d": `${steps * 8}px` };
}

// The photo's share of the width beside the texts (computers), as a CSS variable.
export function widthStyle(width: number | null | undefined): Record<string, string> {
  return { "--photo-w": `${Math.min(70, Math.max(30, width ?? 50))}%` };
}

// "Text beside the photo" on computers: which side the photo is on, how the pair sits in the
// banner and the space between them. Classes written out in full so Tailwind finds them.
export type SplitAlign = "spread" | "start" | "center" | "end";

export function asSplitAlign(value: string | null | undefined): SplitAlign {
  return value === "start" || value === "center" || value === "end" ? value : "spread";
}

export const SPLIT_JUSTIFY_MD: Record<SplitAlign, string> = {
  spread: "md:justify-between", // texts at the start, photo at the far edge
  start: "md:justify-start",
  center: "md:justify-center",
  end: "md:justify-end",
};

export function splitGapPx(gap: number | null | undefined): number {
  return Math.min(16, Math.max(1, gap ?? 4)) * 8;
}

// Text sizes chosen in the admin (% of normal), as CSS variables used by the banner's text classes.
export function textScaleStyle(title: number | null | undefined, body: number | null | undefined): Record<string, string> {
  const factor = (n: number | null | undefined, min: number, max: number) => String(Math.min(max, Math.max(min, n ?? 100)) / 100);
  return { "--title-s": factor(title, 60, 160), "--body-s": factor(body, 70, 150) };
}

// Normal text sizes of the banner in px (phone / computer); the admin preview uses them too.
export const TEXT_PX = {
  title: { mobile: 48, desktop: 72 },
  eyebrow: { mobile: 13, desktop: 13 },
  subtitle: { mobile: 15, desktop: 17 },
  button: { mobile: 15, desktop: 15 },
} as const;

// CSS object-position from the "main point" picked on the photo (0-100 each way).
export function focusStyle(x: number | null | undefined, y: number | null | undefined): { objectPosition: string } {
  return { objectPosition: `${pct(x, 50)}% ${pct(y, 50)}%` };
}
