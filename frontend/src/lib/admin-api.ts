// Calls the admin API from the browser. The sign-in cookie is sent automatically
// (credentials: "include"); JavaScript itself can never read it.

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export type AdminStatus = "PENDING" | "CONFIRMED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
export type AdminPaymentStatus = "UNPAID" | "PAID" | "REFUNDED";
export type AdminDay = "today" | "tomorrow" | "upcoming";

// Why an order was cancelled; shown to the customer too.
export type CancelReason =
  | "OUT_OF_INGREDIENTS"
  | "CANNOT_DELIVER"
  | "CUSTOMER_REQUEST"
  | "SHOP_CLOSED"
  | "UNPAID_TIMEOUT" // set by the automatic cancel only
  | "OTHER";
export type StaffCancelReason = Exclude<CancelReason, "UNPAID_TIMEOUT">;
export const STAFF_CANCEL_REASONS: StaffCancelReason[] = [
  "OUT_OF_INGREDIENTS",
  "CANNOT_DELIVER",
  "CUSTOMER_REQUEST",
  "SHOP_CLOSED",
  "OTHER",
];

// One row of a bulk-cancel preview or result (paid rows need a refund).
export type BulkCancelRow = {
  code: string;
  status: AdminStatus;
  paid: boolean;
  total: number;
  customerName: string;
  customerPhone: string;
};

export type AdminOrder = {
  code: string;
  status: AdminStatus;
  paymentStatus: AdminPaymentStatus;
  customerName: string;
  customerPhone: string;
  address: string;
  note: string | null;
  locale: string;
  deliveryZoneId: number;
  deliveryZone: { vi: string; en: string };
  customerEditCount: number; // times the customer changed the contact details
  customerEditedAt: string | null; // a change by the customer that staff haven't marked as seen
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
  erased: boolean; // customer details were erased (privacy)
  cancelReason: CancelReason | null;
  cancelNote: string | null;
};

// Contact details staff (or the customer) can change after ordering. Only the fields sent change.
export type ContactChanges = Partial<{
  customerName: string;
  customerPhone: string;
  address: string;
  deliveryZoneId: number;
  note: string | null;
}>;

export type OrderHistoryFilters = {
  q?: string;
  status?: AdminStatus;
  payment?: AdminPaymentStatus;
  cancelReason?: CancelReason;
  dateBy?: "created" | "delivery";
  from?: string; // YYYY-MM-DD
  to?: string;
  productId?: number;
  zoneId?: number;
  edited?: "1";
  sort?: "new" | "old" | "totalDesc" | "totalAsc";
  page?: number;
};

export type OrderHistory = {
  orders: AdminOrder[];
  count: number;
  revenue: number; // matching orders, cancelled ones left out
  page: number;
  pageSize: number;
  products: { id: number; nameVi: string; nameEn: string }[];
  zones: { id: number; nameVi: string; nameEn: string; isActive: boolean }[];
};

export function historyQueryString(filters: OrderHistoryFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "" && value !== null) params.set(key, String(value));
  }
  return params.toString();
}

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

export type AdminRole = "ADMIN" | "STAFF";

export type AdminReviewComment = {
  id: number;
  parentId: number | null;
  displayName: string;
  isShop: boolean;
  body: string | null;
  photoUrl: string | null;
  deleted: boolean;
  hidden: boolean;
  reportCount: number;
  createdAt: string;
};

export type AdminReview = {
  id: number;
  product: { nameVi: string; nameEn: string; slug: string };
  orderCode: string;
  displayName: string;
  rating: number;
  body: string | null;
  flavor: string | null;
  photos: string[];
  upvotes: number;
  downvotes: number;
  reportCount: number;
  hidden: boolean;
  createdAt: string;
  comments: AdminReviewComment[];
};

export type ReviewFilter = "all" | "reported" | "low" | "photos" | "hidden";

export type AdminReviewList = {
  reviews: AdminReview[];
  reportedComments: {
    id: number;
    reviewId: number;
    product: { nameVi: string; nameEn: string };
    displayName: string;
    body: string | null;
    photoUrl: string | null;
    reportCount: number;
    createdAt: string;
  }[];
};

// Polled by every admin page: newest order, orders waiting for the payment check, open orders per day.
export type OrderPulse = {
  latestId: number;
  latestCode: string | null;
  waiting: number;
  pending: {
    code: string;
    total: number;
    totalPortions: number;
    deliveryType: "ASAP" | "SCHEDULED";
    deliveryDate: string;
    deliverySlot: string | null;
    createdAt: string;
  }[];
  open: Record<AdminDay, number>;
};

export type AdminMe = {
  id: number;
  name: string;
  email: string;
  role: AdminRole;
  mustChangePassword: boolean; // signed in with a temporary password
  notifyNewOrders: boolean; // receives "new order" emails
};

export type AdminAccount = {
  id: number;
  email: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  mustChangePassword: boolean;
  locked: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

// Shown to the admin once, right after creating an account or resetting its password.
export type TemporaryPasswordResult = {
  account: AdminAccount;
  temporaryPassword: string;
  accounts: AdminAccount[];
};

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
  legalName: string | null;
  legalAddress: string | null;
  registrationNumber: string | null;
  contactEmail: string | null;
  dataRetentionMonths: number;
  orderingPaused: boolean;
  pauseMessageVi: string | null;
  pauseMessageEn: string | null;
  showSoldCount: boolean;
  soldCountMinimum: number;
  maxQuantityPerItem: number;
  reviewWindowDays: number;
  maxReviewPhotos: number;
  reportAlertThreshold: number;
};

export type SalesReport = {
  from: string | null;
  to: string | null;
  unit: "day" | "month";
  totals: { orders: number; portions: number; revenue: number };
  products: {
    productId: number | null;
    slug: string | null;
    nameVi: string;
    nameEn: string;
    imageUrl: string | null;
    portions: number;
    orders: number;
    revenue: number;
  }[];
  periods: { start: string; orders: number; portions: number; revenue: number }[];
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

// AVAILABLE can be ordered; SOLD_OUT and COMING_SOON are shown with a label but can't be ordered.
export type AdminAvailability = "AVAILABLE" | "SOLD_OUT" | "COMING_SOON";
export const AVAILABILITIES: AdminAvailability[] = ["AVAILABLE", "SOLD_OUT", "COMING_SOON"];

export type AdminOption = {
  id?: number;
  type: "FLAVOR" | "PACKAGE";
  nameVi: string;
  nameEn: string;
  priceDelta: number;
  portions: number;
  isActive: boolean;
  availability: AdminAvailability;
  dailyLimit: number | null; // flavors only: most portions per delivery day
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
  soldOutUntil: string | null; // YYYY-MM-DD: no deliveries on or before this day
  dailyLimit: number | null; // most portions of this cake per day
  availability: AdminAvailability;
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

export type UploadKind = "product" | "banner" | "post";

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
  heroIntervalSeconds: number; // banner slides change every N seconds
};

// An extra slide of the homepage banner (shown in turn after the main banner).
export type HeroSlideInput = {
  eyebrowVi: string | null;
  eyebrowEn: string | null;
  titleVi: string;
  titleEn: string;
  subtitleVi: string | null;
  subtitleEn: string | null;
  ctaVi: string | null;
  ctaEn: string | null;
  imageUrl: string | null;
  productId: number | null;
  startDate: string | null; // YYYY-MM-DD, empty = from now
  endDate: string | null; // empty = no end
  isActive: boolean;
  sortOrder: number;
};

export type AdminHeroSlide = HeroSlideInput & { id: number };

// ---------- News posts ----------

export type PostCategory = "NEWS" | "NEW_CAKE" | "UPDATE" | "EVENT" | "LETTER";

export type PostInput = {
  slug: string; // empty = made from the Vietnamese title
  category: PostCategory;
  titleVi: string;
  titleEn: string | null;
  summaryVi: string | null;
  summaryEn: string | null;
  bodyVi: string;
  bodyEn: string | null;
  coverImageUrl: string | null;
  isPublished: boolean;
  isPinned: boolean;
  allowComments: boolean; // customers may comment under the post
  publishAt: string; // ISO time
};

export type AdminPost = PostInput & {
  id: number;
  createdAt: string;
  updatedAt: string;
  commentCount: number;
  reportedComments: number; // reported and still showing
};

export type AdminPostComment = {
  id: number;
  parentId: number | null;
  displayName: string;
  isShop: boolean;
  body: string | null;
  deleted: boolean;
  hidden: boolean;
  reportCount: number;
  createdAt: string;
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
  heroSlides: AdminHeroSlide[];
};

export const adminApi = {
  login: (email: string, password: string) =>
    request<AdminMe>("/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>("/logout", { method: "POST", body: "{}" }),
  me: () => request<AdminMe>("/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<AdminMe>("/me/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
  requestPasswordReset: (email: string) =>
    request<{ ok: true }>("/password-reset/request", { method: "POST", body: JSON.stringify({ email }) }),
  confirmPasswordReset: (token: string, newPassword: string) =>
    request<{ ok: true }>("/password-reset/confirm", { method: "POST", body: JSON.stringify({ token, newPassword }) }),
  setNotifyNewOrders: (notifyNewOrders: boolean) =>
    request<AdminMe>("/me/notifications", { method: "PUT", body: JSON.stringify({ notifyNewOrders }) }),
  pushPublicKey: () => request<{ publicKey: string | null }>("/push/public-key"),
  pushSubscribe: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    request<{ ok: true }>("/push/subscribe", { method: "POST", body: JSON.stringify(subscription) }),
  pushUnsubscribe: (endpoint: string) =>
    request<{ ok: true }>("/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) }),
  pushTest: () => request<{ sent: number }>("/push/test", { method: "POST", body: "{}" }),
  listReviews: (filter: ReviewFilter) => request<AdminReviewList>(`/reviews?filter=${filter}`),
  hideReview: (id: number, hidden: boolean) =>
    request<{ ok: true }>(`/reviews/${id}/hide`, { method: "POST", body: JSON.stringify({ hidden }) }),
  hideReviewComment: (id: number, hidden: boolean) =>
    request<{ ok: true }>(`/reviews/comments/${id}/hide`, { method: "POST", body: JSON.stringify({ hidden }) }),
  deleteReview: (id: number) => request<{ ok: true }>(`/reviews/${id}`, { method: "DELETE" }),
  removeReviewPhoto: (id: number, url: string) =>
    request<{ ok: true }>(`/reviews/${id}/photos/remove`, { method: "POST", body: JSON.stringify({ url }) }),
  removeCommentPhoto: (id: number) => request<{ ok: true }>(`/reviews/comments/${id}/photo/remove`, { method: "POST", body: "{}" }),
  replyToReview: (id: number, body: string, parentId: number | null) =>
    request<{ ok: true }>(`/reviews/${id}/reply`, { method: "POST", body: JSON.stringify({ body, parentId }) }),
  getStats: (from: string | null, to: string | null) => {
    const query = new URLSearchParams();
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    const text = query.toString();
    return request<SalesReport>(`/stats${text ? `?${text}` : ""}`);
  },
  listAccounts: () => request<AdminAccount[]>("/accounts"),
  createAccount: (input: { email: string; name: string; role: AdminRole }) =>
    request<TemporaryPasswordResult>("/accounts", { method: "POST", body: JSON.stringify(input) }),
  updateAccount: (id: number, input: { name: string; role: AdminRole; isActive: boolean }) =>
    request<AdminAccount[]>(`/accounts/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  resetPassword: (id: number) =>
    request<TemporaryPasswordResult>(`/accounts/${id}/reset-password`, { method: "POST", body: "{}" }),
  updateStock: (
    id: number,
    input: {
      soldOutUntil: string | null;
      dailyLimit: number | null;
      availability: AdminAvailability;
      options: { id: number; availability: AdminAvailability; dailyLimit?: number | null }[];
    },
  ) =>
    request<AdminProduct>(`/products/${id}/stock`, { method: "PUT", body: JSON.stringify(input) }),
  orderHistory: (filters: OrderHistoryFilters) => request<OrderHistory>(`/orders/history?${historyQueryString(filters)}`),
  // Downloads the CSV file of the filtered orders (opens in Excel).
  exportOrders: async (filters: OrderHistoryFilters) => {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/api/admin/orders/export?${historyQueryString({ ...filters, page: undefined })}`, {
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      throw new AdminApiError("NETWORK", 0);
    }
    if (!response.ok) throw new AdminApiError(response.status === 401 ? "UNAUTHORIZED" : "UNKNOWN", response.status);
    const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "orders.csv";
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  editContact: (code: string, changes: ContactChanges) =>
    request<AdminOrder>(`/orders/${code}/contact`, { method: "POST", body: JSON.stringify(changes) }),
  markEditSeen: (code: string) => request<AdminOrder>(`/orders/${code}/edit-seen`, { method: "POST", body: "{}" }),
  listOrders: (day: AdminDay, status?: AdminStatus) =>
    request<AdminOrderList>(`/orders?day=${day}${status ? `&status=${status}` : ""}`),
  advance: (code: string, expectedStatus: AdminStatus) =>
    request<AdminOrder>(`/orders/${code}/advance`, { method: "POST", body: JSON.stringify({ expectedStatus }) }),
  cancel: (code: string, expectedStatus: AdminStatus, reason: StaffCancelReason, note?: string) =>
    request<AdminOrder>(`/orders/${code}/cancel`, {
      method: "POST",
      body: JSON.stringify({ expectedStatus, reason, note: note || undefined }),
    }),
  bulkCancelPreview: (date: string, productId: number | null) =>
    request<{ orders: BulkCancelRow[] }>("/orders/bulk-cancel/preview", {
      method: "POST",
      body: JSON.stringify({ date, productId }),
    }),
  bulkCancel: (date: string, productId: number | null, reason: StaffCancelReason, note?: string) =>
    request<{ cancelled: BulkCancelRow[] }>("/orders/bulk-cancel", {
      method: "POST",
      body: JSON.stringify({ date, productId, reason, note: note || undefined }),
    }),
  eraseCustomer: (code: string) =>
    request<AdminOrder>(`/orders/${code}/erase-customer`, { method: "POST", body: "{}" }),
  refund: (code: string) => request<AdminOrder>(`/orders/${code}/refund`, { method: "POST", body: "{}" }),
  testTelegram: () => request<{ ok: true }>("/telegram/test", { method: "POST", body: "{}" }),
  latestOrder: () => request<OrderPulse>("/orders/latest"),
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
  listPosts: () => request<AdminPost[]>("/posts"),
  createPost: (post: PostInput) => request<AdminPost[]>("/posts", { method: "POST", body: JSON.stringify(post) }),
  updatePost: (id: number, post: PostInput) =>
    request<AdminPost[]>(`/posts/${id}`, { method: "PUT", body: JSON.stringify(post) }),
  deletePost: (id: number) => request<AdminPost[]>(`/posts/${id}`, { method: "DELETE" }),
  listPostComments: (postId: number) => request<AdminPostComment[]>(`/posts/${postId}/comments`),
  hidePostComment: (id: number, hidden: boolean) =>
    request<{ ok: true }>(`/posts/comments/${id}/hide`, { method: "POST", body: JSON.stringify({ hidden }) }),
  replyPostComment: (postId: number, body: string, parentId: number | null) =>
    request<{ ok: true }>(`/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ body, parentId }) }),
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
  createHeroSlide: (slide: HeroSlideInput) =>
    request<HomeBundle>("/hero-slides", { method: "POST", body: JSON.stringify(slide) }),
  updateHeroSlide: (id: number, slide: HeroSlideInput) =>
    request<HomeBundle>(`/hero-slides/${id}`, { method: "PUT", body: JSON.stringify(slide) }),
  deleteHeroSlide: (id: number) => request<HomeBundle>(`/hero-slides/${id}`, { method: "DELETE" }),
  listCategories: () => request<AdminCategory[]>("/categories"),
  createCategory: (input: Omit<AdminCategory, "id">) =>
    request<AdminCategory>("/categories", { method: "POST", body: JSON.stringify(input) }),
  updateCategory: ({ id, _count: _ignored, ...input }: AdminCategory) =>
    request<AdminCategory>(`/categories/${id}`, { method: "PUT", body: JSON.stringify(input) }),
};
