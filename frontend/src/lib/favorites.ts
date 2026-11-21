// Favorite cakes ("hearts"). The browser always keeps a copy so hearts show at once and work
// for guests. When the visitor is signed in, or has notifications on, the server keeps them too
// (so they sync across devices and can be told when a favorite is back in stock, cheaper...).
// See backend/src/routes/favorites.ts.

import type { Locale } from "@/i18n/config";
import { currentSubscription } from "./customer-push";
import { request } from "./public-api";

const STORAGE_KEY = "chuvachi-favorites";
const CHANGE_EVENT = "chuvachi:favorites-changed";

// ids: hearted cakes. pending: hearted while the server didn't keep them; sent on the next sync.
// saved: the server keeps this visitor's favorites (signed in, or notifications on).
type Stored = { ids: number[]; pending: number[]; saved?: boolean };
const EMPTY: Stored = { ids: [], pending: [] };

export type FavoriteItem = {
  id: number;
  slug: string;
  name: string;
  imageUrl: string | null;
  availability: "AVAILABLE" | "SOLD_OUT" | "COMING_SOON";
};
export type FavoriteList = { saved: boolean; ids: number[]; items: FavoriteItem[]; newCakeAlerts: boolean };

const isIdList = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((id) => Number.isInteger(id) && id > 0);

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): Stored {
  if (!raw) return EMPTY;
  try {
    const value = JSON.parse(raw) as Partial<Stored>;
    return {
      ids: isIdList(value.ids) ? value.ids : [],
      pending: isIdList(value.pending) ? value.pending : [],
      saved: value.saved === true,
    };
  } catch {
    return EMPTY;
  }
}

function write(next: Stored): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked (private mode): hearts last for this page view only.
  }
  memory = next;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

let memory: Stored | null = null; // used when storage is blocked
let cachedRaw: string | null | undefined;
let cachedIds: number[] = [];

// The same array until the list changes (for useSyncExternalStore).
export function getFavoritesSnapshot(): number[] {
  const raw = readRaw();
  if (raw === null && memory) return memory.ids;
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedIds = parse(raw).ids;
  }
  return cachedIds;
}

const NO_IDS: number[] = [];
export function getServerFavoritesSnapshot(): number[] {
  return NO_IDS;
}

// Whether the server keeps this visitor's favorites (as of the last sync).
export function getFavoritesSavedSnapshot(): boolean {
  return stored().saved === true;
}

export function getServerFavoritesSavedSnapshot(): boolean {
  return false;
}

export function subscribeToFavorites(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

function stored(): Stored {
  const raw = readRaw();
  return raw === null && memory ? memory : parse(raw);
}

async function pushEndpoint(): Promise<string | undefined> {
  try {
    return (await currentSubscription())?.endpoint;
  } catch {
    return undefined;
  }
}

// Hearts or un-hearts a cake: at once in the browser, then on the server when it keeps favorites.
export async function setFavorite(productId: number, on: boolean): Promise<void> {
  const current = stored();
  const ids = on ? [productId, ...current.ids.filter((id) => id !== productId)] : current.ids.filter((id) => id !== productId);
  const pending = current.pending.filter((id) => id !== productId);
  write({ ...current, ids, pending: on ? [...pending, productId] : pending });
  try {
    const result = await request<{ saved: boolean }>("/api/favorites/toggle", {
      method: "POST",
      body: JSON.stringify({ productId, on, endpoint: await pushEndpoint() }),
    });
    if (result.saved && on) {
      const latest = stored();
      write({ ...latest, pending: latest.pending.filter((id) => id !== productId) });
    }
  } catch {
    // Offline or not saved: stays pending and is sent on the next sync.
  }
}

// Sends hearts made in this browser to the server (after signing in or switching notifications
// on) and takes the server's list as the truth. Returns that list, or null when the server
// doesn't keep favorites for this visitor (guest without notifications).
export async function syncFavorites(locale: Locale): Promise<FavoriteList | null> {
  const current = stored();
  try {
    const list = await request<FavoriteList>("/api/favorites/merge", {
      method: "POST",
      body: JSON.stringify({ productIds: current.pending, endpoint: await pushEndpoint(), locale }),
    });
    if (!list.saved) {
      if (current.saved) write({ ...current, saved: false });
      return null;
    }
    write({ ids: list.ids, pending: [], saved: true });
    return list;
  } catch {
    return null;
  }
}

// "Tell me when there is a new cake".
export async function setNewCakeAlerts(on: boolean): Promise<void> {
  await request<{ ok: true }>("/api/favorites/new-cakes", {
    method: "POST",
    body: JSON.stringify({ on, endpoint: await pushEndpoint() }),
  });
}
