import type { SiteTheme } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma";
import { pickText, type Locale } from "./locale";
import { vietnamToday } from "./time";

// Seasonal looks (Christmas, Tet...): which parts of the shop pages can change color,
// the built-in icons and falling effects, and which look is showing right now.

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

export const ICONS = [
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

// Pieces drawn by the shop pages that can fall (or float, fly, twinkle) together.
export const PIECES = [
  "snow",
  "stars",
  "ornaments",
  "candycanes",
  "gifts",
  "apricot",
  "peach",
  "envelopes",
  "coins",
  "hearts",
  "roses",
  "petals",
  "pumpkins",
  "skulls",
  "candy",
  "bats",
  "ghosts",
  "lanterns",
  "mooncakes",
  "confetti",
  "balloons",
] as const;
export type PieceKind = (typeof PIECES)[number];
export type EffectPiece = { kind: PieceKind; weight: number }; // weight 1-3 = few / some / many
export const MAX_EFFECT_IMAGES = 3;

export const pieceSchema = z.object({ kind: z.enum(PIECES), weight: z.number().int().min(1).max(3) });

function isPiece(kind: unknown): kind is PieceKind {
  return typeof kind === "string" && (PIECES as readonly string[]).includes(kind);
}

// The falling pieces of a look. Looks saved before pieces could be mixed have one old "effect" instead.
export function readPieces(theme: Pick<SiteTheme, "effectPieces" | "effect">): EffectPiece[] {
  const pieces: EffectPiece[] = [];
  if (Array.isArray(theme.effectPieces)) {
    for (const item of theme.effectPieces) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const { kind, weight } = item as Record<string, unknown>;
      if (isPiece(kind) && !pieces.some((piece) => piece.kind === kind)) {
        pieces.push({ kind, weight: typeof weight === "number" ? Math.min(3, Math.max(1, Math.round(weight))) : 2 });
      }
    }
  }
  if (pieces.length === 0 && isPiece(theme.effect)) pieces.push({ kind: theme.effect, weight: 2 });
  return pieces;
}

// Uploaded pictures that fall with the pieces (older looks: the one "effectImageUrl").
export function readImages(theme: Pick<SiteTheme, "effectImages" | "effect" | "effectImageUrl">): string[] {
  const images = Array.isArray(theme.effectImages)
    ? theme.effectImages.filter((url): url is string => typeof url === "string" && url.length > 0)
    : [];
  if (images.length === 0 && theme.effect === "image" && theme.effectImageUrl) images.push(theme.effectImageUrl);
  return images.slice(0, MAX_EFFECT_IMAGES);
}

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a color like #8b1e2d");

export const colorsSchema = z
  .object(Object.fromEntries(COLOR_KEYS.map((key) => [key, hexColor.nullable().optional()])) as Record<ColorKey, z.ZodOptional<z.ZodNullable<typeof hexColor>>>)
  .strict();

// Keeps only valid colors from what is stored (the column is free JSON).
export function readColors(value: unknown): ThemeColors {
  const result: ThemeColors = {};
  if (!value || typeof value !== "object") return result;
  for (const key of COLOR_KEYS) {
    const color = (value as Record<string, unknown>)[key];
    if (typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) result[key] = color.toLowerCase();
  }
  return result;
}

// "MM-DD" of a calendar date, to compare days of the year.
function monthDay(date: Date): string {
  return date.toISOString().slice(5, 10);
}

// Whether today falls between the look's dates (both days included).
export function isInSchedule(theme: Pick<SiteTheme, "scheduleOn" | "startDate" | "endDate" | "yearly">, today: Date): boolean {
  if (!theme.scheduleOn || !theme.startDate || !theme.endDate) return false;
  if (!theme.yearly) {
    return theme.startDate.getTime() <= today.getTime() && today.getTime() <= theme.endDate.getTime();
  }
  const start = monthDay(theme.startDate);
  const end = monthDay(theme.endDate);
  const day = monthDay(today);
  // Dates across New Year (e.g. 20 Dec - 5 Jan) wrap around.
  return start <= end ? start <= day && day <= end : day >= start || day <= end;
}

export type ThemeSettings = {
  themesOff: boolean;
  themePinnedId: number | null;
  themePinnedAt: Date | null;
  themeDefaultId: number | null;
};

export async function loadThemeSettings(): Promise<ThemeSettings> {
  const settings = await prisma.shopSetting.findUnique({
    where: { id: 1 },
    select: { themesOff: true, themePinnedId: true, themePinnedAt: true, themeDefaultId: true },
  });
  return {
    themesOff: settings?.themesOff ?? false,
    themePinnedId: settings?.themePinnedId ?? null,
    themePinnedAt: settings?.themePinnedAt ?? null,
    themeDefaultId: settings?.themeDefaultId ?? null,
  };
}

// A look turned on by hand stays on until the end day of its dates: for yearly dates, the first
// end day on or after the day it was turned on. Without dates it stays on until turned off.
export function pinnedUntil(theme: Pick<SiteTheme, "endDate" | "yearly">, pinnedAt: Date | null): Date | null {
  if (!theme.endDate) return null;
  if (!theme.yearly) return theme.endDate;
  const from = pinnedAt ?? vietnamToday();
  const month = theme.endDate.getUTCMonth();
  const day = theme.endDate.getUTCDate();
  let end = new Date(Date.UTC(from.getUTCFullYear(), month, day));
  if (end.getTime() < from.getTime()) end = new Date(Date.UTC(from.getUTCFullYear() + 1, month, day));
  return end;
}

// The look showing now: none when switched off, the one turned on by hand (until its end day),
// else the first look (in list order) whose dates include today, else the everyday default look.
export function pickActiveTheme<T extends SiteTheme>(themes: T[], settings: ThemeSettings, today: Date = vietnamToday()): T | null {
  if (settings.themesOff) return null;
  if (settings.themePinnedId !== null) {
    const pinned = themes.find((theme) => theme.id === settings.themePinnedId);
    const until = pinned ? pinnedUntil(pinned, settings.themePinnedAt) : null;
    if (pinned && (!until || today.getTime() <= until.getTime())) return pinned;
  }
  const scheduled = themes.find((theme) => isInSchedule(theme, today));
  if (scheduled) return scheduled;
  return settings.themeDefaultId !== null ? (themes.find((theme) => theme.id === settings.themeDefaultId) ?? null) : null;
}

export async function findActiveTheme(): Promise<SiteTheme | null> {
  const [themes, settings] = await Promise.all([
    prisma.siteTheme.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    loadThemeSettings(),
  ]);
  return pickActiveTheme(themes, settings);
}

// What the shop pages need to show a look, in one language.
export function publicTheme(theme: SiteTheme, locale: Locale) {
  const pieces = readPieces(theme);
  const images = readImages(theme);
  const showEffect = theme.effectOn && (pieces.length > 0 || images.length > 0);
  return {
    id: theme.id,
    colors: readColors(theme.colors),
    message: pickText(locale, theme.messageVi, theme.messageEn)?.trim() || null,
    linkUrl: theme.linkUrl,
    icon: theme.iconUrl ? null : theme.icon,
    iconUrl: theme.iconUrl,
    effect: showEffect
      ? {
          pieces,
          images,
          amount: theme.effectAmount,
          speed: theme.effectSpeed,
          size: theme.effectSize,
          sizeMix: theme.effectSizeMix,
          allPages: theme.effectAllPages,
        }
      : null,
  };
}
