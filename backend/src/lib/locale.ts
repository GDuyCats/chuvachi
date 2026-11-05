export type Locale = "vi" | "en";

// Reads the "locale" query parameter. Anything other than "en" falls back to Vietnamese.
export function parseLocale(value: unknown): Locale {
  return value === "en" ? "en" : "vi";
}

// Picks the Vietnamese or English version of a text field.
export function pickText(locale: Locale, vi: string, en: string): string;
export function pickText(locale: Locale, vi: string | null, en: string | null): string | null;
export function pickText(locale: Locale, vi: string | null, en: string | null): string | null {
  return locale === "en" ? en ?? vi : vi ?? en;
}
