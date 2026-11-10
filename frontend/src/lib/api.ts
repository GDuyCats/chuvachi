import "server-only";
import { cacheLife } from "next/cache";
import type { Locale } from "@/i18n/config";

// Shapes returned by the backend API (see backend/src/routes/catalog.ts).

// Only AVAILABLE can be ordered; the others are shown with a label.
export type Availability = "AVAILABLE" | "SOLD_OUT" | "COMING_SOON";
export type ProductOption = {
  id: number;
  type: "FLAVOR" | "PACKAGE";
  name: string;
  priceDelta: number;
  portions: number;
  availability?: Availability;
};

export type Product = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  ingredients: string | null;
  allergens: string | null;
  imageUrl: string | null; // cover photo
  images: string[]; // all photos in display order
  basePrice: number;
  isNew: boolean;
  availability?: Availability;
  soldOutUntil: string | null; // YYYY-MM-DD: can't be delivered on or before this day
  soldCount?: number | null; // portions sold, only when the shop shows it
  rating?: { average: number; count: number } | null; // from customers' reviews
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
  legalName: string | null;
  legalAddress: string | null;
  registrationNumber: string | null;
  contactEmail: string | null;
  dataRetentionMonths: number;
  unpaidCancelMinutes: number;
  smallOrderLeadHours: number;
  largeOrderLeadHours: number;
  largeOrderThreshold: number;
  maxQuantityPerItem: number;
  reviewWindowDays: number;
  orderingPaused: boolean;
  pauseMessageVi: string | null;
  pauseMessageEn: string | null;
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
  legalName: null,
  legalAddress: null,
  registrationNumber: null,
  contactEmail: null,
  dataRetentionMonths: 12,
  unpaidCancelMinutes: 30,
  smallOrderLeadHours: 3,
  largeOrderLeadHours: 24,
  largeOrderThreshold: 10,
  maxQuantityPerItem: 20,
  reviewWindowDays: 30,
  orderingPaused: false,
  pauseMessageVi: null,
  pauseMessageEn: null,
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

export type HomeProduct = {
  slug: string;
  name: string;
  price: number; // starting price in VND
  isNew: boolean;
  availability?: Availability;
  imageUrl: string | null;
};

export type HeroSlideView = {
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  cta: string | null;
  imageUrl: string | null;
  productSlug: string | null;
};

export type HomeContent = {
  announcement: { left: string | null; center: string | null; right: string | null; productSlug: string | null } | null;
  hero: {
    eyebrow: string | null;
    title: string;
    subtitle: string | null;
    cta: string | null;
    imageUrl: string | null;
    productSlug: string | null;
  } | null;
  heroSlides: HeroSlideView[]; // the main banner first, then the extra slides
  heroInterval: number; // seconds between slides
  hasNew: boolean;
  categories: { slug: string; name: string }[];
  season: { name: string; eyebrow: string | null; description: string | null; endDate: string; products: HomeProduct[] } | null;
  comingSoon: { id: number; dateLabel: string; name: string; note: string | null }[];
};

const EMPTY_HOME: HomeContent = {
  announcement: null,
  hero: null,
  heroSlides: [],
  heroInterval: 6,
  hasNew: false,
  categories: [],
  season: null,
  comingSoon: [],
};

// Homepage texts, banner, season and "coming soon", edited by staff in the admin page.
// If the API is unreachable, the blocks are simply hidden instead of breaking every page.
export async function getHomeContent(locale: Locale): Promise<HomeContent> {
  "use cache";
  cacheLife("minutes");
  try {
    // Missing fields (e.g. an older backend) fall back to the empty values.
    return { ...EMPTY_HOME, ...(await getJson<Partial<HomeContent>>(`/api/home?locale=${locale}`)) };
  } catch {
    return EMPTY_HOME;
  }
}

// ---------- News ----------

export type PostCategory = "NEWS" | "NEW_CAKE" | "UPDATE" | "EVENT" | "LETTER";

export type PostCard = {
  slug: string;
  category: PostCategory;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  publishedAt: string; // ISO time
  pinned: boolean;
};

export type PostFull = PostCard & { body: string };

// Published news posts, pinned first. Empty list if the backend can't be reached.
export async function getPosts(locale: Locale): Promise<PostCard[]> {
  "use cache";
  cacheLife("minutes");
  try {
    return await getJson<PostCard[]>(`/api/posts?locale=${locale}`);
  } catch {
    return [];
  }
}

export async function getPost(locale: Locale, slug: string): Promise<PostFull | null> {
  "use cache";
  cacheLife("minutes");
  const response = await fetch(apiUrl(`/api/posts/${encodeURIComponent(slug)}?locale=${locale}`));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`API request failed: ${response.status} /api/posts/${slug}`);
  return (await response.json()) as PostFull;
}

