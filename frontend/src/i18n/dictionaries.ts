import "server-only";
import type { Locale } from "./config";
import type en from "./dictionaries/en.json";

export type Dictionary = typeof en;

// Each language file is loaded only on the server, so translations never bloat the browser bundle.
const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  en: () => import("./dictionaries/en.json").then((module) => module.default),
  vi: () => import("./dictionaries/vi.json").then((module) => module.default),
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]();
}
