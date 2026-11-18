// Seasonal looks (Christmas, Tet...): shared by the shop pages and the admin editor.
// See backend/src/lib/site-theme.ts for how the look showing now is picked.

export const COLOR_KEYS = [
  "btn",
  "btnInk",
  "head",
  "headInk",
  "bar",
  "barInk",
  "foot",
  "footInk",
  "hero",
  "heroInk",
  "accent",
  "accentInk",
] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];
export type ThemeColors = Partial<Record<ColorKey, string>>;

// The normal black and white colors (the same fallbacks as in globals.css).
export const DEFAULT_COLORS: Record<ColorKey, string> = {
  btn: "#000000",
  btnInk: "#ffffff",
  head: "#ffffff",
  headInk: "#000000",
  bar: "#000000",
  barInk: "#ffffff",
  foot: "#000000",
  footInk: "#ffffff",
  hero: "#141414",
  heroInk: "#ffffff",
  accent: "#000000",
  accentInk: "#ffffff",
};

// Background + text pairs, as shown in the admin.
export const COLOR_PAIRS = [
  { part: "btn", bg: "btn", ink: "btnInk" },
  { part: "head", bg: "head", ink: "headInk" },
  { part: "bar", bg: "bar", ink: "barInk" },
  { part: "foot", bg: "foot", ink: "footInk" },
  { part: "hero", bg: "hero", ink: "heroInk" },
  { part: "accent", bg: "accent", ink: "accentInk" },
] as const satisfies readonly { part: string; bg: ColorKey; ink: ColorKey }[];
export type ColorPart = (typeof COLOR_PAIRS)[number]["part"];

export const THEME_ICONS = [
  "tree",
  "star",
  "snowflake",
  "gift",
  "apricot",
  "envelope",
  "lantern",
  "moon",
  "heart",
  "flower",
  "pumpkin",
  "cake",
  "tag",
] as const;
export type ThemeIconName = (typeof THEME_ICONS)[number];

export const THEME_EFFECTS = ["none", "snow", "apricot", "peach", "petals", "hearts", "stars", "confetti", "image"] as const;
export type ThemeEffectKind = (typeof THEME_EFFECTS)[number];

export type ThemeEffectView = {
  kind: ThemeEffectKind;
  imageUrl: string | null;
  amount: number; // 10-100
  speed: number; // 10-100
  size: number; // 10-100
  allPages: boolean; // false = homepage only
};

// What the shop pages get from GET /api/theme.
export type SiteThemeView = {
  id: number;
  colors: ThemeColors;
  message: string | null;
  linkUrl: string | null;
  icon: string | null;
  iconUrl: string | null;
  effect: ThemeEffectView | null;
};

// "btnInk" -> "--t-btn-ink"
function variableName(key: ColorKey): string {
  return `--t-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

export const THEME_VARIABLES = COLOR_KEYS.map(variableName);

// CSS variables read by the color classes in globals.css (bg-btn, text-foot-ink...).
export function themeVars(colors: ThemeColors | null | undefined): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const key of COLOR_KEYS) {
    const color = colors?.[key];
    if (color) vars[variableName(key)] = color;
  }
  return vars;
}

// Where the top-bar message links to: a page of this site gets the language added.
export function themeHref(linkUrl: string | null, lang: string): string | null {
  if (!linkUrl) return null;
  return linkUrl.startsWith("/") ? `/${lang}${linkUrl === "/" ? "" : linkUrl}` : linkUrl;
}

// How readable text of one color is on another (1 = invisible, 21 = black on white).
// 4.5 or more is comfortable for normal text.
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, bl] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
