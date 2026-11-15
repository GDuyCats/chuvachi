// Where the texts of a "text on the photo" banner sit, and which part of the photo stays in view.
// Shared by the homepage banner and the admin preview so both look the same.

export const TEXT_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;
export type TextPosition = (typeof TEXT_POSITIONS)[number];
export type TextAlign = "left" | "center" | "right";

export const DEFAULT_POSITION: TextPosition = "middle-left";
export const DEFAULT_MOBILE_POSITION: TextPosition = "bottom-left";

export function asPosition(value: string | null | undefined, fallback: TextPosition): TextPosition {
  return TEXT_POSITIONS.includes(value as TextPosition) ? (value as TextPosition) : fallback;
}

// The text block's place in the banner (the banner is a flex row: items = up/down, justify = left/right).
// Written out in full so Tailwind finds every class.
export const PLACE: Record<TextPosition, string> = {
  "top-left": "items-start justify-start",
  "top-center": "items-start justify-center",
  "top-right": "items-start justify-end",
  "middle-left": "items-center justify-start",
  "middle-center": "items-center justify-center",
  "middle-right": "items-center justify-end",
  "bottom-left": "items-end justify-start",
  "bottom-center": "items-end justify-center",
  "bottom-right": "items-end justify-end",
};

export const PLACE_MD: Record<TextPosition, string> = {
  "top-left": "md:items-start md:justify-start",
  "top-center": "md:items-start md:justify-center",
  "top-right": "md:items-start md:justify-end",
  "middle-left": "md:items-center md:justify-start",
  "middle-center": "md:items-center md:justify-center",
  "middle-right": "md:items-center md:justify-end",
  "bottom-left": "md:items-end md:justify-start",
  "bottom-center": "md:items-end md:justify-center",
  "bottom-right": "md:items-end md:justify-end",
};

// Lines of text and the button inside the block.
export const ALIGN: Record<TextAlign, string> = {
  left: "items-start text-left",
  center: "items-center text-center",
  right: "items-end text-right",
};

// A dark fade on the side where the texts are, so white text stays readable on any photo.
export function shadeFor(position: TextPosition): string {
  const [vertical, horizontal] = position.split("-");
  if (horizontal === "left") return "linear-gradient(to right, rgba(0,0,0,0.78), rgba(0,0,0,0.38) 45%, rgba(0,0,0,0.05))";
  if (horizontal === "right") return "linear-gradient(to left, rgba(0,0,0,0.78), rgba(0,0,0,0.38) 45%, rgba(0,0,0,0.05))";
  if (vertical === "top") return "linear-gradient(to bottom, rgba(0,0,0,0.78), rgba(0,0,0,0.38) 45%, rgba(0,0,0,0.05))";
  if (vertical === "bottom") return "linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0.4) 45%, rgba(0,0,0,0.05))";
  return "radial-gradient(ellipse at center, rgba(0,0,0,0.6), rgba(0,0,0,0.25) 75%)";
}

// CSS object-position from the "main point" picked on the photo (0-100 each way).
export function focusStyle(x: number | null | undefined, y: number | null | undefined): { objectPosition: string } {
  const clamp = (n: number | null | undefined) => Math.min(100, Math.max(0, n ?? 50));
  return { objectPosition: `${clamp(x)}% ${clamp(y)}%` };
}
