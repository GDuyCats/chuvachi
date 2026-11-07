"use client";

import "./globals.css";
import texts from "@/i18n/dictionaries/errors.json";

// Last line of defence: shown if even the page layout crashes. It must draw the whole page itself.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = texts.vi;
  const en = texts.en;
  return (
    <html lang="vi">
      <body className="flex min-h-screen flex-col items-start justify-center gap-4 bg-white px-6 text-black">
        <h1 className="text-4xl font-bold uppercase">{t.errorTitle}</h1>
        <p>{t.errorBody}</p>
        <p className="text-sm text-[#666666]">{en.errorBody}</p>
        <button type="button" onClick={reset} className="min-h-12 bg-black px-8 font-bold text-white">
          {t.retry} / {en.retry}
        </button>
      </body>
    </html>
  );
}
