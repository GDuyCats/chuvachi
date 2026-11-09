// The shopping cart lives in the visitor's browser (localStorage).
// It only stores which cake, options and quantity were chosen - never prices.
// Prices are always recalculated from the database when the order is placed.

export type FlavorPart = { optionId: number; portions: number };

export type CartLine = {
  productSlug: string;
  flavorOptionId: number | null;
  packageOptionId: number | null;
  // Mixed box: portions of each flavor in one box (adds up to the box size). flavorOptionId is then null.
  flavorMix?: FlavorPart[];
  quantity: number;
};

const STORAGE_KEY = "chuvachi-cart";
const CHANGE_EVENT = "chuvachi-cart-change";
// The real limit is set in the admin (Settings > Order rules) and passed in by the pages;
// this is only used before the shop settings have loaded.
export const MAX_LINE_QUANTITY = 20;
const EMPTY: CartLine[] = [];

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Record<string, unknown>;
  return (
    typeof line.productSlug === "string" &&
    (line.flavorOptionId === null || typeof line.flavorOptionId === "number") &&
    (line.packageOptionId === null || typeof line.packageOptionId === "number") &&
    typeof line.quantity === "number" &&
    line.quantity > 0 &&
    (line.flavorMix === undefined ||
      (Array.isArray(line.flavorMix) &&
        line.flavorMix.every(
          (part) =>
            typeof part === "object" &&
            part !== null &&
            typeof (part as FlavorPart).optionId === "number" &&
            typeof (part as FlavorPart).portions === "number",
        )))
  );
}

// Same flavors in the same amounts, whatever the order they were picked in.
function mixKey(mix: FlavorPart[] | undefined): string {
  if (!mix || mix.length === 0) return "";
  return [...mix]
    .sort((a, b) => a.optionId - b.optionId)
    .map((part) => `${part.optionId}:${part.portions}`)
    .join(",");
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): CartLine[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    // Ignore anything that doesn't look like a cart line (old or tampered data).
    return Array.isArray(parsed) ? parsed.filter(isCartLine) : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function readCart(): CartLine[] {
  return parse(readRaw());
}

// Returns the same array object until the cart changes (needed by React's useSyncExternalStore).
let cachedRaw: string | null | undefined;
let cachedLines: CartLine[] = EMPTY;
export function getCartSnapshot(): CartLine[] {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedLines = parse(raw);
  }
  return cachedLines;
}

export function getServerCartSnapshot(): CartLine[] {
  return EMPTY;
}

export function writeCart(lines: CartLine[]): void {
  try {
    if (lines.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    }
  } catch {
    // Storage can be blocked (private mode); the cart then only lasts for this page view.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function sameChoice(a: CartLine, b: CartLine): boolean {
  return (
    a.productSlug === b.productSlug &&
    a.flavorOptionId === b.flavorOptionId &&
    a.packageOptionId === b.packageOptionId &&
    mixKey(a.flavorMix) === mixKey(b.flavorMix)
  );
}

// Adds a line, or increases the quantity if the same cake and options are already in the cart.
export function addToCart(line: CartLine, max = MAX_LINE_QUANTITY): CartLine[] {
  const lines = readCart();
  const existing = lines.find((l) => sameChoice(l, line));
  const next = existing
    ? lines.map((l) =>
        sameChoice(l, line) ? { ...l, quantity: Math.min(max, l.quantity + line.quantity) } : l,
      )
    : [...lines, { ...line, quantity: Math.min(max, line.quantity) }];
  writeCart(next);
  return next;
}

export function setLineQuantity(index: number, quantity: number, max = MAX_LINE_QUANTITY): void {
  const lines = readCart();
  if (!lines[index]) return;
  const next = lines.map((line, i) =>
    i === index ? { ...line, quantity: Math.max(1, Math.min(max, quantity)) } : line,
  );
  writeCart(next);
}

export function removeLine(index: number): void {
  writeCart(readCart().filter((_, i) => i !== index));
}

export function removeLines(shouldRemove: (line: CartLine) => boolean): void {
  writeCart(readCart().filter((line) => !shouldRemove(line)));
}

export function clearCart(): void {
  writeCart([]);
}

export function cartItemCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

// Calls the listener whenever the cart changes, in this tab or another tab.
export function subscribeToCart(listener: () => void): () => void {
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
