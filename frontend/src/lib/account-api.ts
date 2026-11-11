// Customer account calls from the browser. The sign-in cookie is httpOnly, so JavaScript
// never sees it; the browser simply sends it with each request.

import type { Locale } from "@/i18n/config";
import { request, type CancelReason, type OrderContactChanges, type OrderEditResult, type OrderLookup } from "./public-api";

export type CustomerProfile = {
  name: string;
  email: string;
  avatarUrl: string | null;
  phone: string | null;
  defaultAddress: string | null;
  defaultZoneId: number | null;
};

export type ProfileInput = {
  name: string;
  phone: string;
  defaultAddress: string;
  defaultZoneId: number | null;
};

export type AccountOrder = {
  code: string;
  status: "PENDING" | "CONFIRMED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
  paymentStatus: "UNPAID" | "PAID" | "REFUNDED";
  deliveryType: "ASAP" | "SCHEDULED";
  deliveryDate: string;
  deliverySlot: string | null;
  deliveryZone: string;
  total: number;
  cancelReason: CancelReason | null;
  cancelNote: string | null;
  items: { name: string; quantity: number }[];
  createdAt: string;
};

// Lets the header and other parts of the page know that the visitor signed in or out.
export type CustomerNotice = {
  id: number;
  title: string;
  body: string;
  url: string;
  read: boolean;
  createdAt: string;
};

export const ACCOUNT_CHANGED_EVENT = "chuvachi:account-changed";

function announceChange() {
  window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT));
}

export const accountApi = {
  signInWithGoogle: async (credential: string) => {
    const profile = await request<CustomerProfile>("/api/account/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    });
    announceChange();
    return profile;
  },
  signOut: async () => {
    await request<{ ok: true }>("/api/account/logout", { method: "POST", body: "{}" });
    announceChange();
  },
  // The signed-in customer, or null for guests (never fails with "unauthorized").
  current: async () =>
    (await request<{ profile: CustomerProfile | null }>("/api/account/session", { cache: "no-store" })).profile,
  me: () => request<CustomerProfile>("/api/account/me", { cache: "no-store" }),
  updateMe: (input: ProfileInput) =>
    request<CustomerProfile>("/api/account/me", { method: "PUT", body: JSON.stringify(input) }),
  deleteMe: async () => {
    await request<{ ok: true }>("/api/account/me", { method: "DELETE" });
    announceChange();
  },
  orders: (locale: Locale) => request<AccountOrder[]>(`/api/account/orders?locale=${locale}`, { cache: "no-store" }),
  // One of the customer's own orders, same view as the Track order page.
  order: (code: string, locale: Locale) =>
    request<OrderLookup>(`/api/account/orders/${encodeURIComponent(code)}?locale=${locale}`, { cache: "no-store" }),
  // Change the contact details of one of the customer's own orders.
  editOrder: (code: string, locale: Locale, changes: OrderContactChanges) =>
    request<OrderEditResult>(`/api/account/orders/${encodeURIComponent(code)}/contact`, {
      method: "POST",
      body: JSON.stringify({ locale, changes }),
    }),
  // Bell list on the website (newest first) and the number of unread ones.
  notifications: (locale: Locale) =>
    request<{ unread: number; items: CustomerNotice[] }>(`/api/account/notifications?locale=${locale}`, { cache: "no-store" }),
  unreadCount: () => request<{ unread: number }>("/api/account/notifications/unread", { cache: "no-store" }),
  markNotificationsRead: () => request<{ ok: true }>("/api/account/notifications/read", { method: "POST", body: "{}" }),
  claimOrder: (code: string, phone: string) =>
    request<{ ok: true }>("/api/account/orders/claim", { method: "POST", body: JSON.stringify({ code, phone }) }),
};
