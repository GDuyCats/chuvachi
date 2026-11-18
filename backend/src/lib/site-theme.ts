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

export const EFFECTS = ["none", "snow", "apricot", "peach", "petals", "hearts", "stars", "confetti", "image"] as const;
export type EffectKind = (typeof EFFECTS)[number];

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

export type ThemeSettings = { themesOff: boolean; themePinnedId: number | null };

export async function loadThemeSettings(): Promise<ThemeSettings> {
  const settings = await prisma.shopSetting.findUnique({ where: { id: 1 }, select: { themesOff: true, themePinnedId: true } });
  return { themesOff: settings?.themesOff ?? false, themePinnedId: settings?.themePinnedId ?? null };
}

// The look showing now: none when switched off, the one turned on by hand, or else the first
// look (in list order) whose dates include today.
export function pickActiveTheme<T extends SiteTheme>(themes: T[], settings: ThemeSettings, today: Date = vietnamToday()): T | null {
  if (settings.themesOff) return null;
  if (settings.themePinnedId !== null) {
    const pinned = themes.find((theme) => theme.id === settings.themePinnedId);
    if (pinned) return pinned;
  }
  return themes.find((theme) => isInSchedule(theme, today)) ?? null;
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
  const kind = (EFFECTS as readonly string[]).includes(theme.effect) ? (theme.effect as EffectKind) : "none";
  const showEffect = theme.effectOn && kind !== "none" && (kind !== "image" || Boolean(theme.effectImageUrl));
  return {
    id: theme.id,
    colors: readColors(theme.colors),
    message: pickText(locale, theme.messageVi, theme.messageEn)?.trim() || null,
    linkUrl: theme.linkUrl,
    icon: theme.iconUrl ? null : theme.icon,
    iconUrl: theme.iconUrl,
    effect: showEffect
      ? {
          kind,
          imageUrl: kind === "image" ? theme.effectImageUrl : null,
          amount: theme.effectAmount,
          speed: theme.effectSpeed,
          size: theme.effectSize,
          allPages: theme.effectAllPages,
        }
      : null,
  };
}
