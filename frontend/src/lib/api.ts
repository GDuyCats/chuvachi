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

// Product list for the menu. Cached for a few minutes so the site stays fast
// and the backend is not called on every visit.
export async function getProducts(locale: Locale): Promise<Product[]> {
  "use cache";
  cacheLife("minutes");
  return getJson<Product[]>(`/api/products?locale=${locale}`);
}
