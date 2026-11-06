// Calls the backend API directly from the visitor's browser (checkout, order lookup).
// The backend only accepts these calls from our own website (CORS) and limits how often they can be made.

import type { Locale } from "@/i18n/config";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export type DeliveryType = "ASAP" | "SCHEDULED";

export type OrderSettings = {
  today: string; // shop date, YYYY-MM-DD (Vietnam time)
  now: string; // server time, ISO string
  asapAvailable: boolean;
  openTime: string;
  closeTime: string;
  deliverySlots: string[];
  closedWeekdays: number[];
  maxDaysAhead: number;
  largeOrderThreshold: number;
  smallOrderLeadHours: number;
  largeOrderLeadHours: number;
  unpaidCancelMinutes: number;
  deliveryZones: { id: number; name: string }[];
};

export type PlaceOrderRequest = {
  customerName: string;
  customerPhone: string;
  address: string;
  note?: string;
  deliveryZoneId: number;
  deliveryType: DeliveryType;
  deliveryDate?: string;
  deliverySlot?: string;
  locale: Locale;
  privacyConsent: true; // the customer ticked the box themselves
  items: {
    productSlug: string;
    flavorOptionId: number | null;
    packageOptionId: number | null;
    quantity: number;
  }[];
};

export type PlaceOrderResult = {
  code: string;
  status: string;
  deliveryType: DeliveryType;
  deliveryDate: string;
  deliverySlot: string | null;
  totalPortions: number;
  total: number;
  unpaidCancelMinutes: number;
  bankTransfer: {
    bankBin: string | null;
    bankName: string | null;
    accountNumber: string | null;
    accountName: string | null;
    amount: number;
    transferContent: string;
  };
};

// Error with a stable code (e.g. "DAY_FULLY_BOOKED") that the page translates for the visitor.
export class ApiError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      // Sends the sign-in cookie (if any), so orders are saved to the customer's account.
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("NETWORK");
  }

  if (!response.ok) {
    let code = "UNKNOWN";
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string") code = body.error;
    } catch {
      // Keep "UNKNOWN" when the body is not JSON.
    }
    throw new ApiError(code);
  }
  return (await response.json()) as T;
}

export function fetchOrderSettings(locale: Locale): Promise<OrderSettings> {
  return request<OrderSettings>(`/api/order-settings?locale=${locale}`, { cache: "no-store" });
}

export function placeOrder(body: PlaceOrderRequest): Promise<PlaceOrderResult> {
  return request<PlaceOrderResult>("/api/orders", { method: "POST", body: JSON.stringify(body) });
}

export type OrderStatus = "PENDING" | "CONFIRMED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";

export type OrderLookup = {
  code: string;
  status: OrderStatus;
  paymentStatus: "UNPAID" | "PAID" | "REFUNDED";
  customerName: string;
  address: string; // partly hidden by the server
  deliveryZone: string;
  deliveryType: DeliveryType;
  deliveryDate: string;
  deliverySlot: string | null;
  totalPortions: number;
  total: number;
  items: { name: string; unitPrice: number; quantity: number; portions: number }[];
  createdAt: string;
  updatedAt: string;
};

export function fetchOrder(code: string, phone: string, locale: Locale): Promise<OrderLookup> {
  const query = new URLSearchParams({ phone, locale });
  return request<OrderLookup>(`/api/orders/${encodeURIComponent(code)}?${query.toString()}`, { cache: "no-store" });
}
