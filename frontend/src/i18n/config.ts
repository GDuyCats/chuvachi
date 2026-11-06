// Supported languages. Vietnamese is the default for visitors we can't detect.
export const locales = ["vi", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "vi";

// Cookie that remembers the language a visitor picked with the VI / EN switch.
export const localeCookieName = "NEXT_LOCALE";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
