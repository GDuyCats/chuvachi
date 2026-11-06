// The shopping cart lives in the visitor's browser (localStorage).
// It only stores which cake, options and quantity were chosen - never prices.
// Prices are always recalculated from the database when the order is placed.

export type CartLine = {
  productSlug: string;
  flavorOptionId: number | null;
  packageOptionId: number | null;
  quantity: number;
};

const STORAGE_KEY = "chuvachi-cart";
const CHANGE_EVENT = "chuvachi-cart-change";
export const MAX_LINE_QUANTITY = 20;

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Record<string, unknown>;
  return (
    typeof line.productSlug === "string" &&
    (line.flavorOptionId === null || typeof line.flavorOptionId === "number") &&
    (line.packageOptionId === null || typeof line.packageOptionId === "number") &&
    typeof line.quantity === "number" &&
    line.quantity > 0
  );
}

export function readCart(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // Ignore anything that doesn't look like a cart line (old or tampered data).
    return Array.isArray(parsed) ? parsed.filter(isCartLine) : [];
  } catch {
    return [];
  }
}

export function writeCart(lines: CartLine[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Storage can be blocked (private mode); the cart then only lasts for this page view.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function sameChoice(a: CartLine, b: CartLine): boolean {
  return (
    a.productSlug === b.productSlug &&
    a.flavorOptionId === b.flavorOptionId &&
    a.packageOptionId === b.packageOptionId
  );
}

// Adds a line, or increases the quantity if the same cake and options are already in the cart.
export function addToCart(line: CartLine): CartLine[] {
  const lines = readCart();
  const existing = lines.find((l) => sameChoice(l, line));
  const next = existing
    ? lines.map((l) =>
        sameChoice(l, line) ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, l.quantity + line.quantity) } : l,
      )
    : [...lines, { ...line, quantity: Math.min(MAX_LINE_QUANTITY, line.quantity) }];
  writeCart(next);
  return next;
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
