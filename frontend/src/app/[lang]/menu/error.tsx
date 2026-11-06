"use client";

import { useParams } from "next/navigation";
import errorTexts from "@/i18n/dictionaries/errors.json";

// Shown when the menu can't be loaded (for example, the backend is down).
// Error pages run in the browser, so they use a small separate text file instead of the full dictionary.
export default function MenuError({ reset }: { error: Error; reset: () => void }) {
  const params = useParams<{ lang: string }>();
  const t = params.lang === "en" ? errorTexts.en : errorTexts.vi;

  return (
    <section className="flex flex-col items-start gap-4 px-4 py-20 md:px-10">
      <h1 className="font-display text-4xl uppercase md:text-5xl">{t.menuTitle}</h1>
      <p className="text-muted">{t.menuBody}</p>
      <button type="button" onClick={reset} className="min-h-12 bg-black px-8 font-bold text-white">
        {t.retry}
      </button>
    </section>
  );
}
