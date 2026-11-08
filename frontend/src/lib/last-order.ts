// Keeps the order the visitor just placed for the confirmation page.
// sessionStorage is cleared when the tab is closed, so it isn't left on shared computers.

import type { PlaceOrderResult } from "./public-api";

export type LastOrder = PlaceOrderResult & {
  customerPhone?: string; // lets this tab turn on notifications for the order (proves it is theirs)
  deliveryZoneName: string;
  items: { name: string; quantity: number; lineTotal: number }[];
};

const STORAGE_KEY = "chuvachi-last-order";

export function saveLastOrder(order: LastOrder): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {
    // If storage is blocked, the confirmation page shows the "look up your order" message instead.
  }
}

export function loadLastOrder(): LastOrder | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastOrder;
    return typeof parsed?.code === "string" ? parsed : null;
  } catch {
    return null;
  }
}
