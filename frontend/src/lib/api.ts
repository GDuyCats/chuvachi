import "server-only";
import { cacheLife } from "next/cache";
import type { Locale } from "@/i18n/config";

// Shapes returned by the backend API (see backend/src/routes/catalog.ts).
export type ProductOption = {
  id: number;
  type: "FLAVOR" | "PACKAGE";
  name: string;
  priceDelta: number;
  portions: number;
};

export type Product = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  basePrice: number;
  isNew: boolean;
  category: { slug: string; name: string };
  options: ProductOption[];
};

function apiUrl(path: string): string {
  const base = process.env.API_URL;
  if (!base) {
    throw new Error("API_URL is not set. Add it to frontend/.env.local");
  }
  return `${base.replace(/\/$/, "")}${path}`;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path));
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${path}`);
  }
  return (await response.json()) as T;
}

// One product, or null when it doesn't exist (or is hidden).
export async function getProduct(locale: Locale, slug: string): Promise<Product | null> {
  "use cache";
  cacheLife("minutes");
  const response = await fetch(apiUrl(`/api/products/${encodeURIComponent(slug)}?locale=${locale}`));
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} /api/products/${slug}`);
  }
  return (await response.json()) as Product;
}

// Product list for the menu. Cached for a few minutes so the site stays fast
// and the backend is not called on every visit.
export async function getProducts(locale: Locale): Promise<Product[]> {
  "use cache";
  cacheLife("minutes");
  return getJson<Product[]>(`/api/products?locale=${locale}`);
}

export type ShopInfo = {
  phone: string | null;
  messengerUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  openTime: string | null;
  closeTime: string | null;
  closedWeekdays: number[];
};

const EMPTY_SHOP_INFO: ShopInfo = {
  phone: null,
  messengerUrl: null,
  facebookUrl: null,
  instagramUrl: null,
  tiktokUrl: null,
  openTime: null,
  closeTime: null,
  closedWeekdays: [],
};

// Contact details and opening hours, edited by staff in the admin page.
// If the API is unreachable the footer simply shows "coming soon" instead of breaking every page.
export async function getShopInfo(): Promise<ShopInfo> {
  "use cache";
  cacheLife("minutes");
  try {
    return await getJson<ShopInfo>("/api/shop-info");
  } catch {
    return EMPTY_SHOP_INFO;
  }
}
