// Calls the admin API from the browser. The sign-in cookie is sent automatically
// (credentials: "include"); JavaScript itself can never read it.

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export type AdminStatus = "PENDING" | "CONFIRMED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
export type AdminPaymentStatus = "UNPAID" | "PAID" | "REFUNDED";
export type AdminDay = "today" | "tomorrow" | "upcoming";

export type AdminOrder = {
  code: string;
  status: AdminStatus;
  paymentStatus: AdminPaymentStatus;
  customerName: string;
  customerPhone: string;
  address: string;
  note: string | null;
  locale: string;
  deliveryZone: { vi: string; en: string };
  deliveryType: "ASAP" | "SCHEDULED";
  deliveryDate: string;
  deliverySlot: string | null;
  totalPortions: number;
  total: number;
  items: { name: { vi: string; en: string }; quantity: number; unitPrice: number; portions: number }[];
  events: {
    action: string;
    fromStatus: AdminStatus | null;
    toStatus: AdminStatus | null;
    note: string | null;
    by: string | null;
    at: string;
  }[];
  createdAt: string;
  updatedAt: string;
};

export type AdminOrderList = {
  day: AdminDay;
  date: string | null;
  summary: {
    counts: Partial<Record<AdminStatus, number>>;
    activeOrders: number;
    bookedPortions: number;
    maxPortions: number;
    waitingForPayment: number;
    unpaidCancelMinutes: number;
  };
  orders: AdminOrder[];
};

export type AdminMe = { id: number; name: string; email: string };

export class AdminApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/admin${path}`, {
      ...init,
      credentials: "include",
      cache: "no-store",
      // File uploads (FormData) set their own content type; everything else is JSON.
      headers: init?.body instanceof FormData ? init?.headers : { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new AdminApiError("NETWORK", 0);
  }
  if (!response.ok) {
    let code = "UNKNOWN";
    let fields: string[] = [];
    try {
      const body = (await response.json()) as { error?: unknown; details?: { field?: unknown }[] };
      if (typeof body.error === "string") code = body.error;
      if (Array.isArray(body.details)) {
        fields = body.details.map((d) => (typeof d.field === "string" ? d.field : "")).filter(Boolean);
      }
    } catch {
      // keep UNKNOWN
    }
    if (code === "VALIDATION_ERROR") throw new AdminValidationError(fields);
    throw new AdminApiError(code, response.status);
  }
  return (await response.json()) as T;
}

export type ShopSettings = {
  openTime: string;
  closeTime: string;
  closedWeekdays: number[];
  deliverySlots: string[];
  smallOrderLeadHours: number;
  largeOrderLeadHours: number;
  largeOrderThreshold: number;
  defaultDailyCapacity: number;
  maxDaysAhead: number;
  unpaidCancelMinutes: number;
  bankBin: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  phone: string | null;
  messengerUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
};

export type DeliveryZoneRow = { id: number; nameVi: string; nameEn: string; isActive: boolean; sortOrder: number };
export type CapacityDay = { date: string; maxPortions: number; bookedPortions: number; isCustom: boolean };
export type SettingsBundle = { settings: ShopSettings; zones: DeliveryZoneRow[]; capacity: CapacityDay[] };

// Validation problems returned by the server, field by field.
export class AdminValidationError extends AdminApiError {
  constructor(public readonly fields: string[]) {
    super("VALIDATION_ERROR", 400);
  }
}

export type AdminOption = {
  id?: number;
  type: "FLAVOR" | "PACKAGE";
  nameVi: string;
  nameEn: string;
  priceDelta: number;
  portions: number;
  isActive: boolean;
  sortOrder: number;
};

export type AdminCategory = {
  id: number;
  slug: string;
  nameVi: string;
  nameEn: string;
  sortOrder: number;
  _count?: { products: number };
};

export type AdminProductInput = {
  slug: string;
  categoryId: number;
  nameVi: string;
  nameEn: string;
  descriptionVi: string | null;
  descriptionEn: string | null;
  ingredientsVi: string | null;
  ingredientsEn: string | null;
  allergensVi: string | null;
  allergensEn: string | null;
  images: string[]; // photos in display order; the first one is the cover
  basePrice: number;
  isActive: boolean;
  isNew: boolean;
  sortOrder: number;
  options: AdminOption[];
};

export type AdminProduct = AdminProductInput & {
  id: number;
  imageUrl: string | null; // cover photo
  category: AdminCategory;
  options: (AdminOption & { id: number })[];
};

export type UploadKind = "product" | "banner";

// ---------- Homepage ----------

export type HomeContentInput = {
  announcementLeftVi: string | null;
  announcementLeftEn: string | null;
  announcementCenterVi: string | null;
  announcementCenterEn: string | null;
  announcementRightVi: string | null;
  announcementRightEn: string | null;
  announcementProductId: number | null;
  heroIsActive: boolean;
  heroEyebrowVi: string | null;
  heroEyebrowEn: string | null;
  heroTitleVi: string | null;
  heroTitleEn: string | null;
  heroSubtitleVi: string | null;
  heroSubtitleEn: string | null;
  heroCtaVi: string | null;
  heroCtaEn: string | null;
  heroImageUrl: string | null;
  heroProductId: number | null;
};

export type SeasonInput = {
  nameVi: string;
  nameEn: string;
  eyebrowVi: string | null;
  eyebrowEn: string | null;
  descriptionVi: string | null;
  descriptionEn: string | null;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  isActive: boolean;
  productIds: number[];
};

export type AdminSeason = SeasonInput & { id: number };

export type ComingSoonInput = {
  dateLabel: string;
  nameVi: string;
  nameEn: string;
  noteVi: string | null;
  noteEn: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type AdminComingSoon = ComingSoonInput & { id: number };

export type HomeBundle = {
  content: HomeContentInput;
  seasons: AdminSeason[];
  comingSoon: AdminComingSoon[];
  products: { id: number; nameVi: string; nameEn: string; isActive: boolean }[];
};

export const adminApi = {
  login: (email: string, password: string) =>
    request<AdminMe>("/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>("/logout", { method: "POST", body: "{}" }),
  me: () => request<AdminMe>("/me"),
  listOrders: (day: AdminDay, status?: AdminStatus) =>
    request<AdminOrderList>(`/orders?day=${day}${status ? `&status=${status}` : ""}`),
  advance: (code: string, expectedStatus: AdminStatus) =>
    request<AdminOrder>(`/orders/${code}/advance`, { method: "POST", body: JSON.stringify({ expectedStatus }) }),
  cancel: (code: string, expectedStatus: AdminStatus, note?: string) =>
    request<AdminOrder>(`/orders/${code}/cancel`, {
      method: "POST",
      body: JSON.stringify({ expectedStatus, note: note || undefined }),
    }),
  refund: (code: string) => request<AdminOrder>(`/orders/${code}/refund`, { method: "POST", body: "{}" }),
  getSettings: () => request<SettingsBundle>("/settings"),
  saveSettings: (settings: ShopSettings) =>
    request<SettingsBundle>("/settings", { method: "PUT", body: JSON.stringify(settings) }),
  addZone: (zone: Omit<DeliveryZoneRow, "id">) =>
    request<SettingsBundle>("/zones", { method: "POST", body: JSON.stringify(zone) }),
  updateZone: (zone: DeliveryZoneRow) => {
    const { id, ...data } = zone;
    return request<SettingsBundle>(`/zones/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  setCapacity: (date: string, maxPortions: number) =>
    request<SettingsBundle>(`/capacity/${date}`, { method: "PUT", body: JSON.stringify({ maxPortions }) }),
  listProducts: () => request<AdminProduct[]>("/products"),
  getProduct: (id: number) => request<AdminProduct>(`/products/${id}`),
  createProduct: (input: AdminProductInput) =>
    request<AdminProduct>("/products", { method: "POST", body: JSON.stringify(input) }),
  updateProduct: (id: number, input: AdminProductInput) =>
    request<AdminProduct>(`/products/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  uploadImage: (kind: UploadKind, file: File) => {
    const body = new FormData();
    body.append("image", file);
    return request<{ url: string }>(`/uploads/${kind}`, { method: "POST", body });
  },
  getHome: () => request<HomeBundle>("/home"),
  saveHome: (content: HomeContentInput) =>
    request<HomeBundle>("/home", { method: "PUT", body: JSON.stringify(content) }),
  createSeason: (season: SeasonInput) =>
    request<HomeBundle>("/seasons", { method: "POST", body: JSON.stringify(season) }),
  updateSeason: (id: number, season: SeasonInput) =>
    request<HomeBundle>(`/seasons/${id}`, { method: "PUT", body: JSON.stringify(season) }),
  deleteSeason: (id: number) => request<HomeBundle>(`/seasons/${id}`, { method: "DELETE" }),
  createComingSoon: (item: ComingSoonInput) =>
    request<HomeBundle>("/coming-soon", { method: "POST", body: JSON.stringify(item) }),
  updateComingSoon: (id: number, item: ComingSoonInput) =>
    request<HomeBundle>(`/coming-soon/${id}`, { method: "PUT", body: JSON.stringify(item) }),
  deleteComingSoon: (id: number) => request<HomeBundle>(`/coming-soon/${id}`, { method: "DELETE" }),
  listCategories: () => request<AdminCategory[]>("/categories"),
  createCategory: (input: Omit<AdminCategory, "id">) =>
    request<AdminCategory>("/categories", { method: "POST", body: JSON.stringify(input) }),
  updateCategory: ({ id, _count: _ignored, ...input }: AdminCategory) =>
    request<AdminCategory>(`/categories/${id}`, { method: "PUT", body: JSON.stringify(input) }),
};
