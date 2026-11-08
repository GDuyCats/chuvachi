import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Anton, Be_Vietnam_Pro } from "next/font/google";
import { AnnouncementBar } from "@/components/AnnouncementBar";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { isLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getHomeContent, getProducts, getShopInfo, type Product } from "@/lib/api";
import { buildSearchIndex } from "@/lib/search-index";
import { SITE_URL } from "@/lib/site-url";
import "../globals.css";

// Both fonts include the "vietnamese" subset so accented letters render correctly.
const anton = Anton({
  weight: "400",
  subsets: ["latin", "vietnamese"],
  variable: "--font-anton",
});

const beVietnamPro = Be_Vietnam_Pro({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "vietnamese"],
  variable: "--font-be-vietnam",
});

// Pre-build every page in both languages.
export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) {
    return {};
  }
  const dict = await getDictionary(lang);
  return {
    metadataBase: new URL(SITE_URL), // makes link-preview images absolute addresses
    title: dict.meta.title,
    description: dict.meta.description,
    openGraph: {
      type: "website",
      siteName: "Chuvachi",
      locale: lang === "vi" ? "vi_VN" : "en_US",
      title: dict.meta.title,
      description: dict.meta.description,
      // Default picture for shared links; a cake's own page uses the cake's photo instead.
      images: [{ url: "/og-default.png", width: 1200, height: 630, alt: "Chuvachi" }],
    },
    alternates: {
      languages: { vi: "/vi", en: "/en" },
    },
  };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    notFound();
  }
  const [dict, home, shop, products] = await Promise.all([
    getDictionary(lang),
    getHomeContent(lang),
    getShopInfo(),
    // The search box still opens (with pages only) if the menu can't be loaded.
    getProducts(lang).catch((): Product[] => []),
  ]);
  const searchIndex = buildSearchIndex(lang, products, home, dict);
  const pauseMessage = lang === "vi" ? shop.pauseMessageVi : shop.pauseMessageEn;

  return (
    <html lang={lang} className={`${anton.variable} ${beVietnamPro.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <AnnouncementBar lang={lang} content={home.announcement} linkLabel={dict.announcement.link} />
        {shop.orderingPaused && (
          // Shown on every page while staff have paused orders (admin, Settings).
          <div role="status" className="border-b-[1.5px] border-black bg-white px-4 py-3 text-center text-sm md:px-6">
            <span className="font-bold">{dict.pause.title}</span>
            {pauseMessage ? <span> · {pauseMessage}</span> : null}
          </div>
        )}
        <SiteHeader lang={lang} dict={dict.nav} searchIndex={searchIndex} searchLabels={dict.search} />
        <main className="flex-1">{children}</main>
        <SiteFooter lang={lang} dict={dict.footer} />
      </body>
    </html>
  );
}
