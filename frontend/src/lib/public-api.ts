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
  orderingPaused: boolean; // the shop switched off ordering for now
  pauseMessage: string | null;
  deliveryZones: { id: number; name: string }[];
};

export type CancelReason =
  | "OUT_OF_INGREDIENTS"
  | "CANNOT_DELIVER"
  | "CUSTOMER_REQUEST"
  | "SHOP_CLOSED"
  | "UNPAID_TIMEOUT"
  | "OTHER";

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
  constructor(
    public readonly code: string,
    public readonly product?: string, // the cake an order error is about, when there is one
  ) {
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
      // File uploads (FormData) set their own content type; everything else is JSON.
      headers: init?.body instanceof FormData ? init?.headers : { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("NETWORK");
  }

  if (!response.ok) {
    let code = "UNKNOWN";
    let product: string | undefined;
    try {
      const body = (await response.json()) as { error?: unknown; product?: unknown };
      if (typeof body.error === "string") code = body.error;
      if (typeof body.product === "string") product = body.product;
    } catch {
      // Keep "UNKNOWN" when the body is not JSON.
    }
    throw new ApiError(code, product);
  }
  return (await response.json()) as T;
}

export function fetchOrderSettings(locale: Locale): Promise<OrderSettings> {
  return request<OrderSettings>(`/api/order-settings?locale=${locale}`, { cache: "no-store" });
}

// Header carrying the one-time Cloudflare Turnstile token (bot check).
function botCheckHeaders(token: string | null): Record<string, string> {
  return token ? { "X-Turnstile-Token": token } : {};
}

export function placeOrder(body: PlaceOrderRequest, turnstileToken: string | null): Promise<PlaceOrderResult> {
  return request<PlaceOrderResult>("/api/orders", {
    method: "POST",
    body: JSON.stringify(body),
    headers: botCheckHeaders(turnstileToken),
  });
}

export type OrderStatus = "PENDING" | "CONFIRMED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";

export type OrderLookup = {
  cancelReason: CancelReason | null; // why the shop cancelled, shown to the customer
  cancelNote: string | null;
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

export function fetchOrder(code: string, phone: string, locale: Locale, turnstileToken: string | null): Promise<OrderLookup> {
  const query = new URLSearchParams({ phone, locale });
  return request<OrderLookup>(`/api/orders/${encodeURIComponent(code)}?${query.toString()}`, {
    cache: "no-store",
    headers: botCheckHeaders(turnstileToken),
  });
}
