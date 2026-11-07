import type { Metadata } from "next";
import "./globals.css";
import texts from "@/i18n/dictionaries/errors.json";

export const metadata: Metadata = {
  title: "404 — Chuvachi",
  robots: { index: false },
};

// For addresses outside the shop pages (anything under /vi and /en has its own page).
// It must draw the whole page itself, so it's kept very simple.
export default function GlobalNotFound() {
  const vi = texts.vi;
  const en = texts.en;
  return (
    <html lang="vi">
      <body className="flex min-h-screen flex-col items-start justify-center gap-4 bg-white px-6 text-black md:px-16">
        <span aria-hidden="true" className="text-[120px] font-bold leading-none text-[#ececec]">
          404
        </span>
        <h1 className="text-4xl font-bold uppercase">{vi.notFoundTitle}</h1>
        <p className="text-sm text-[#666666]">{en.notFoundTitle}</p>
        <a href="/vi" className="flex min-h-12 items-center bg-black px-8 font-bold text-white">
          {vi.toHome} / {en.toHome}
        </a>
      </body>
    </html>
  );
}
