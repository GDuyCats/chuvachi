import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { defaultLocale, isLocale, localeCookieName, locales, type Locale } from "@/i18n/config";

// Picks the visitor's language: saved choice first, then browser language, then the default.
function detectLocale(request: NextRequest): Locale {
  const saved = request.cookies.get(localeCookieName)?.value;
  if (saved && isLocale(saved)) {
    return saved;
  }

  const acceptLanguage = request.headers.get("accept-language") ?? "";
  const preferred = acceptLanguage
    .split(",")
    .map((part) => part.split(";")[0].trim().toLowerCase().slice(0, 2));
  const match = preferred.find((code) => isLocale(code));
  return match && isLocale(match) ? match : defaultLocale;
}

// Sends visitors without a language in the URL (e.g. "/menu") to "/vi/menu" or "/en/menu".
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLocale = locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
  if (hasLocale) {
    return;
  }

  const locale = detectLocale(request);
  request.nextUrl.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  // Skip Next.js internals, API routes and files with an extension (images, favicon, ...).
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
