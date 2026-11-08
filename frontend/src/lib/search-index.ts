import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Availability, HomeContent, Product } from "./api";

// Everything the customer search box can find, built on the server and sent with the page.
export type SearchIndex = {
  products: {
    slug: string;
    name: string;
    category: string;
    flavors: string[];
    description: string | null;
    imageUrl: string | null;
    price: number;
    availability: Availability;
  }[];
  categories: { slug: string; name: string }[];
  season: { name: string; eyebrow: string | null; productSlugs: string[] } | null;
  comingSoon: { name: string; dateLabel: string; note: string | null }[];
  pages: { label: string; href: string; keywords: string }[];
};

function startingPrice(product: Product): number {
  const extras = product.options.filter((o) => o.type === "FLAVOR").map((o) => o.priceDelta);
  return product.basePrice + (extras.length > 0 ? Math.min(...extras) : 0);
}

export function buildSearchIndex(lang: Locale, products: Product[], home: HomeContent, dict: Dictionary): SearchIndex {
  const categories = new Map<string, string>();
  for (const product of products) categories.set(product.category.slug, product.category.name);
  const pages = dict.search.pages;

  return {
    products: products.map((product) => ({
      slug: product.slug,
      name: product.name,
      category: product.category.name,
      flavors: product.options.filter((o) => o.type === "FLAVOR").map((o) => o.name),
      description: product.description ? product.description.slice(0, 300) : null,
      imageUrl: product.imageUrl,
      price: startingPrice(product),
      availability: product.availability ?? "AVAILABLE",
    })),
    categories: [...categories].map(([slug, name]) => ({ slug, name })),
    season: home.season
      ? { name: home.season.name, eyebrow: home.season.eyebrow, productSlugs: home.season.products.map((p) => p.slug) }
      : null,
    comingSoon: home.comingSoon.map((item) => ({ name: item.name, dateLabel: item.dateLabel, note: item.note })),
    pages: [
      { ...pages.menu, href: `/${lang}/menu` },
      { ...pages.cart, href: `/${lang}/order` },
      { ...pages.track, href: `/${lang}/track` },
      { ...pages.account, href: `/${lang}/account` },
      { ...pages.policies, href: `/${lang}/policies` },
      { ...pages.privacy, href: `/${lang}/privacy` },
      { ...pages.contact, href: "#contact" },
    ],
  };
}
