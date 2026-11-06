import "server-only";
import type { Locale } from "@/i18n/config";

// The policy texts live in content/legal/*.json (one file per page and language),
// so they can be edited without touching code.

// Must match PRIVACY_POLICY_VERSION in backend/src/lib/privacy.ts.
export const POLICY_UPDATED = "2026-11-06";

export type LegalBlock = { p: string } | { list: string[] };
export type LegalSection = { id: string; title: string; blocks: LegalBlock[] };
export type LegalDoc = { title: string; intro: string; sections: LegalSection[] };
export type LegalKind = "policies" | "privacy";

const docs: Record<LegalKind, Record<Locale, () => Promise<LegalDoc>>> = {
  policies: {
    vi: () => import("./legal/policies.vi.json").then((m) => m.default),
    en: () => import("./legal/policies.en.json").then((m) => m.default),
  },
  privacy: {
    vi: () => import("./legal/privacy.vi.json").then((m) => m.default),
    en: () => import("./legal/privacy.en.json").then((m) => m.default),
  },
};

export function getLegalDoc(kind: LegalKind, locale: Locale): Promise<LegalDoc> {
  return docs[kind][locale]();
}
