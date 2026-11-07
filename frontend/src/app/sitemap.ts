import type { MetadataRoute } from "next";
import { locales } from "@/i18n/config";
import { getProducts } from "@/lib/api";
import { SITE_URL } from "@/lib/site-url";

// /sitemap.xml - the public pages, in both languages, so search engines find every cake.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let slugs: string[] = [];
  try {
    slugs = (await getProducts("vi")).map((product) => product.slug);
  } catch {
    // Backend unreachable: still list the main pages.
  }

  const paths = ["", "/menu", "/policies", "/privacy", ...slugs.map((slug) => `/menu/${slug}`)];

  return paths.map((path) => ({
    url: `${SITE_URL}/vi${path}`,
    changeFrequency: path === "" || path === "/menu" ? "daily" : "weekly",
    priority: path === "" ? 1 : path.startsWith("/menu") ? 0.8 : 0.3,
    alternates: {
      languages: Object.fromEntries(locales.map((locale) => [locale, `${SITE_URL}/${locale}${path}`])),
    },
  }));
}
