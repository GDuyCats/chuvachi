import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Anton, Be_Vietnam_Pro } from "next/font/google";
import { AnnouncementBar } from "@/components/AnnouncementBar";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { isLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getHomeContent } from "@/lib/api";
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
    title: dict.meta.title,
    description: dict.meta.description,
  };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    notFound();
  }
  const [dict, home] = await Promise.all([getDictionary(lang), getHomeContent(lang)]);

  return (
    <html lang={lang} className={`${anton.variable} ${beVietnamPro.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <AnnouncementBar lang={lang} content={home.announcement} linkLabel={dict.announcement.link} />
        <SiteHeader lang={lang} dict={dict.nav} />
        <main className="flex-1">{children}</main>
        <SiteFooter lang={lang} dict={dict.footer} />
      </body>
    </html>
  );
}
