import { Availability, OptionType, OrderStatus, Prisma, type CustomerPushSubscription } from "@prisma/client";
import text from "../content/customer-alerts.json";
import { parseLocale, pickText, type Locale } from "../lib/locale";
import { prisma } from "../lib/prisma";
import { deliverPush, isPushConfigured, type PushMessage } from "../lib/push";
import { vietnamToday } from "../lib/time";

// Notifications to customers: their order changed status, or someone answered their review
// or comment. Each one goes to the bell list on the website (signed-in customers) and as a
// push notification to the browsers that switched them on. Messages carry only the order
// code, the cake's name and public short names; never a phone number or address.

const KEEP_TRYING_SECONDS = 12 * 60 * 60; // a phone that is off still gets it within half a day
const WATCH_DAYS = 45; // guests follow an order this long after it is finished (covers the review window)
const BELL_KEEP_DAYS = 90; // bell list entries older than this are deleted

type Subscription = CustomerPushSubscription;
type StatusKey = keyof typeof text.vi.status;
type FavoriteKey = keyof typeof text.vi.favorite;
type NoticeValues = Record<string, string | null>;

// One notification, independent of language: the text is built for each reader.
export type Notice = {
  kind: string; // "status.CONFIRMED" ... | "reviewReply" | "commentReply"
  values: NoticeValues;
  path: string; // page to open, without the language prefix
  tag?: string;
};

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

function shorten(value: string, max = 100): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// The title and text of a notice in one language.
export function renderNotice(locale: Locale, kind: string, values: NoticeValues): { title: string; body: string } {
  const t = text[locale];
  if (kind.startsWith("status.")) {
    const key = kind.slice("status.".length) as StatusKey;
    const message = t.status[key];
    if (!message) return { title: "Chuvachi", body: "" };
    return { title: fill(message.title, { code: values.code ?? "" }), body: message.body };
  }
  if (kind === "reviewReply" || kind === "commentReply") {
    return {
      title: fill(t[kind].title, { name: values.name ?? "" }),
      body: fill(t[kind].body, {
        product: pickText(locale, values.productVi ?? "", values.productEn ?? ""),
        text: values.text ? shorten(values.text) : t.photo,
      }),
    };
  }
  if (kind.startsWith("favorite.")) {
    const message = t.favorite[kind.slice("favorite.".length) as FavoriteKey];
    if (!message) return { title: "Chuvachi", body: "" };
    const filled = {
      product: pickText(locale, values.productVi ?? "", values.productEn ?? ""),
      option: pickText(locale, values.optionVi ?? "", values.optionEn ?? ""),
      price: formatPrice(locale, Number(values.price ?? 0)),
    };
    return { title: fill(message.title, filled), body: fill(message.body, filled) };
  }
  if (kind === "newCake" || kind === "newCakeSimilar") {
    const product = pickText(locale, values.productVi ?? "", values.productEn ?? "");
    return { title: fill(t[kind].title, { product }), body: t[kind].body };
  }
  return { title: "Chuvachi", body: "" };
}

function formatPrice(locale: Locale, amount: number): string {
  const number = amount.toLocaleString(locale === "vi" ? "vi-VN" : "en-US");
  return locale === "vi" ? `${number}đ` : `${number} VND`;
}

function toPush(locale: Locale, notice: Notice): PushMessage {
  return { ...renderNotice(locale, notice.kind, notice.values), url: `/${locale}${notice.path}`, tag: notice.tag };
}

async function sendAll(subscriptions: Subscription[], build: (locale: Locale) => PushMessage): Promise<number> {
  if (subscriptions.length === 0 || !isPushConfigured()) return 0;
  const results = await Promise.all(
    subscriptions.map(async (subscription) => {
      const result = await deliverPush(subscription, build(parseLocale(subscription.locale)), KEEP_TRYING_SECONDS);
      if (result === "gone") await prisma.customerPushSubscription.deleteMany({ where: { id: subscription.id } });
      return result === "sent";
    }),
  );
  return results.filter(Boolean).length;
}

// Adds the notice to the bell list of these accounts.
async function saveToBell(customerIds: number[], notice: Notice): Promise<void> {
  const unique = [...new Set(customerIds)];
  if (unique.length === 0) return;
  await prisma.customerNotification.createMany({
    data: unique.map((customerId) => ({
      customerId,
      kind: notice.kind,
      values: notice.values as Prisma.InputJsonObject,
      path: notice.path,
    })),
  });
}

// Browsers that follow an order: the owner's account devices and guests watching it.
async function subscriptionsForOrder(orderId: number, customerId: number | null): Promise<Subscription[]> {
  return prisma.customerPushSubscription.findMany({
    where: {
      OR: [...(customerId ? [{ customerId }] : []), { watches: { some: { orderId } } }],
    },
  });
}

const STATUS_KEYS: Partial<Record<OrderStatus, StatusKey>> = {
  [OrderStatus.CONFIRMED]: "CONFIRMED",
  [OrderStatus.PREPARING]: "PREPARING",
  [OrderStatus.READY]: "READY",
  [OrderStatus.COMPLETED]: "COMPLETED",
  [OrderStatus.CANCELLED]: "CANCELLED",
};

// Tells the customer their order moved on (or was refunded). Never throws: a failed
// notification must not undo or block the staff action.
export async function notifyOrderChange(orderId: number, event: "status" | "refunded"): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, code: true, status: true, customerId: true },
    });
    if (!order) return;
    const key: StatusKey | undefined = event === "refunded" ? "REFUNDED" : STATUS_KEYS[order.status];
    if (!key) return;
    const notice: Notice = {
      kind: `status.${key}`,
      values: { code: order.code },
      path: `/track?code=${order.code}`,
      tag: `order-${order.code}`,
    };
    if (order.customerId) await saveToBell([order.customerId], notice);
    const subscriptions = await subscriptionsForOrder(order.id, order.customerId);
    await sendAll(subscriptions, (locale) => toPush(locale, notice));
  } catch (error) {
    console.error("Customer order notification failed:", error);
  }
}

export function notifyOrderChangeLater(orderIds: number[], event: "status" | "refunded" = "status"): void {
  for (const id of orderIds) void notifyOrderChange(id, event);
}

// Someone commented under a review, or replied to a comment: tell the review's author and,
// for a reply, the author of the comment being answered. Nobody is told about their own words.
export async function notifyNewComment(commentId: number): Promise<void> {
  try {
    const comment = await prisma.reviewComment.findUnique({
      where: { id: commentId },
      include: {
        parent: { select: { customerId: true } },
        review: {
          select: { customerId: true, orderId: true, product: { select: { slug: true, nameVi: true, nameEn: true } } },
        },
      },
    });
    if (!comment) return;
    const writer = comment.customerId; // null for the shop's own replies
    const reviewOwner = comment.review.customerId;
    const ownerIsWriter = writer !== null && reviewOwner === writer;
    const parentAuthor = comment.parent?.customerId ?? null;
    const tellParent = parentAuthor !== null && parentAuthor !== writer && parentAuthor !== reviewOwner;

    const product = comment.review.product;
    const notice = (kind: "reviewReply" | "commentReply"): Notice => ({
      kind,
      values: { name: comment.displayName, productVi: product.nameVi, productEn: product.nameEn, text: comment.body },
      path: `/menu/${product.slug}#reviews`,
      tag: `review-${comment.reviewId}`,
    });

    // Bell list (signed-in customers only).
    if (reviewOwner !== null && !ownerIsWriter) await saveToBell([reviewOwner], notice("reviewReply"));
    if (tellParent) await saveToBell([parentAuthor], notice("commentReply"));

    // Push: the review's author (account devices, or guests following that order) ...
    const reviewOwnerSubs = ownerIsWriter
      ? []
      : (await subscriptionsForOrder(comment.review.orderId, reviewOwner)).filter(
          (s) => writer === null || s.customerId !== writer,
        );
    // ... and the person being answered.
    const parentSubs = tellParent
      ? (await prisma.customerPushSubscription.findMany({ where: { customerId: parentAuthor } })).filter(
          (s) => !reviewOwnerSubs.some((r) => r.id === s.id),
        )
      : [];
    await Promise.all([
      sendAll(reviewOwnerSubs, (locale) => toPush(locale, notice("reviewReply"))),
      sendAll(parentSubs, (locale) => toPush(locale, notice("commentReply"))),
    ]);
  } catch (error) {
    console.error("Comment notification failed:", error);
  }
}

// Someone answered a customer's comment under a news post: tell that customer.
export async function notifyPostReply(commentId: number): Promise<void> {
  try {
    const comment = await prisma.postComment.findUnique({
      where: { id: commentId },
      include: {
        parent: { select: { customerId: true } },
        post: { select: { id: true, slug: true, titleVi: true, titleEn: true } },
      },
    });
    const author = comment?.parent?.customerId ?? null;
    if (!comment || author === null || author === comment.customerId) return;
    const notice: Notice = {
      kind: "commentReply",
      values: {
        name: comment.displayName,
        productVi: comment.post.titleVi,
        productEn: comment.post.titleEn ?? comment.post.titleVi,
        text: comment.body,
      },
      path: `/news/${comment.post.slug}`,
      tag: `post-${comment.post.id}`,
    };
    await saveToBell([author], notice);
    const subscriptions = await prisma.customerPushSubscription.findMany({ where: { customerId: author } });
    await sendAll(subscriptions, (locale) => toPush(locale, notice));
  } catch (error) {
    console.error("News comment notification failed:", error);
  }
}

// A short "it works" message right after a device is switched on.
export async function sendWelcome(subscriptionId: number): Promise<boolean> {
  const subscription = await prisma.customerPushSubscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription) return false;
  const sent = await sendAll([subscription], (locale) => ({ ...text[locale].welcome, url: `/${locale}`, tag: "welcome" }));
  return sent > 0;
}

// Hourly clean-up: guests stop following orders that finished long ago, and old bell entries go.
export async function purgeOldOrderWatches(): Promise<number> {
  const cutoff = new Date(Date.now() - WATCH_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.orderPushWatch.deleteMany({
    where: {
      order: { status: { in: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] }, updatedAt: { lt: cutoff } },
    },
  });
  // Browsers with no account and nothing left to follow (orders or favorite cakes) are not needed any more.
  await prisma.customerPushSubscription.deleteMany({
    where: { customerId: null, watches: { none: {} }, favorites: { none: {} } },
  });
  await prisma.customerNotification.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - BELL_KEEP_DAYS * 24 * 60 * 60 * 1000) } },
  });
  return result.count;
}

// ---------- Favorite cakes ----------

const FAN_GAP_MS = 20 * 60 * 60 * 1000; // at most about one notice a day per cake per person

const snapshotSelect = {
  id: true,
  slug: true,
  nameVi: true,
  nameEn: true,
  categoryId: true,
  isActive: true,
  availability: true,
  soldOutUntil: true,
  basePrice: true,
  announced: true,
  options: {
    select: { id: true, type: true, nameVi: true, nameEn: true, isActive: true, availability: true, priceDelta: true },
  },
} satisfies Prisma.ProductSelect;

export type ProductSnapshot = Prisma.ProductGetPayload<{ select: typeof snapshotSelect }>;

// What a cake looks like now; taken before and after staff save it, to see what changed.
export function productSnapshot(productId: number): Promise<ProductSnapshot | null> {
  return prisma.product.findUnique({ where: { id: productId }, select: snapshotSelect });
}

// Can customers order it now? ("Sold out until" counts as sold out while that day hasn't passed.)
function canOrder(product: ProductSnapshot, today: Date): boolean {
  const pausedUntil = product.soldOutUntil && product.soldOutUntil.getTime() >= today.getTime();
  return product.isActive && product.availability === Availability.AVAILABLE && !pausedUntil;
}

// The "from" price on a card: one portion with the cheapest active flavor.
function fromPrice(product: ProductSnapshot): number {
  const extras = product.options.filter((o) => o.isActive && o.type === OptionType.FLAVOR).map((o) => o.priceDelta);
  return product.basePrice + (extras.length > 0 ? Math.min(...extras) : 0);
}

type FanEvent = { key: FavoriteKey; values: NoticeValues };

// The one change worth telling fans about, most important first. Edits to text or photos,
// and price rises, are never announced.
function fanEvent(before: ProductSnapshot, after: ProductSnapshot, today: Date): FanEvent | null {
  const names = { productVi: after.nameVi, productEn: after.nameEn };
  if (!canOrder(after, today)) return null;
  if (!canOrder(before, today)) {
    return { key: before.availability === Availability.COMING_SOON ? "launched" : "backInStock", values: names };
  }
  const old = new Map(before.options.map((o) => [o.id, o]));
  const added = after.options.filter((o) => o.isActive && o.availability === Availability.AVAILABLE && !old.get(o.id)?.isActive);
  if (added.length > 0) {
    return { key: "newOption", values: { ...names, optionVi: added[0].nameVi, optionEn: added[0].nameEn } };
  }
  // A flavor or box that was sold out can be ordered again.
  const restocked = after.options.some(
    (o) => o.isActive && o.availability === Availability.AVAILABLE && old.get(o.id)?.isActive && old.get(o.id)?.availability !== Availability.AVAILABLE,
  );
  if (restocked) return { key: "backInStock", values: names };
  const price = fromPrice(after);
  if (price < fromPrice(before)) return { key: "priceDrop", values: { ...names, price: String(price) } };
  return null;
}

// Pushes to all browsers of these accounts and to these guest browsers, each once.
async function subscriptionsFor(customerIds: number[], subscriptionIds: number[]): Promise<Subscription[]> {
  if (customerIds.length === 0 && subscriptionIds.length === 0) return [];
  return prisma.customerPushSubscription.findMany({
    where: { OR: [{ customerId: { in: customerIds } }, { id: { in: subscriptionIds } }] },
  });
}

// Everyone who opted in to "new cakes" (or hasn't chosen and has at least one favorite) hears about
// a cake that goes on sale for the first time. People who like a cake of the same kind get a
// warmer message; people who already hearted this very cake get the "now on sale" notice instead.
async function announceNewCake(product: ProductSnapshot): Promise<void> {
  const fans = await prisma.favorite.findMany({ where: { productId: product.id }, select: { customerId: true, subscriptionId: true } });
  const fanCustomers = fans.flatMap((fan) => (fan.customerId ? [fan.customerId] : []));
  const fanSubs = fans.flatMap((fan) => (fan.subscriptionId ? [fan.subscriptionId] : []));
  // Opted in, or never chose and has at least one favorite.
  const optedIn = (): Prisma.CustomerWhereInput[] => [{ newCakeAlerts: true }, { newCakeAlerts: null, favorites: { some: {} } }];
  const guestOptedIn = (): Prisma.CustomerPushSubscriptionWhereInput[] => [
    { newCakeAlerts: true },
    { newCakeAlerts: null, favorites: { some: {} } },
  ];
  const sameKind = { where: { product: { categoryId: product.categoryId } }, select: { id: true }, take: 1 } as const;

  const [customers, guests] = await Promise.all([
    prisma.customer.findMany({
      where: { id: { notIn: fanCustomers }, OR: optedIn() },
      select: { id: true, favorites: sameKind },
    }),
    prisma.customerPushSubscription.findMany({
      where: { customerId: null, id: { notIn: fanSubs }, OR: guestOptedIn() },
      include: { favorites: sameKind },
    }),
  ]);

  const notice = (kind: "newCake" | "newCakeSimilar"): Notice => ({
    kind,
    values: { productVi: product.nameVi, productEn: product.nameEn },
    path: `/menu/${product.slug}`,
    tag: `new-${product.id}`,
  });
  const similar = customers.filter((c) => c.favorites.length > 0).map((c) => c.id);
  const plain = customers.filter((c) => c.favorites.length === 0).map((c) => c.id);
  await saveToBell(similar, notice("newCakeSimilar"));
  await saveToBell(plain, notice("newCake"));

  const accountSubs = await subscriptionsFor([...similar, ...plain], []);
  const similarSet = new Set(similar);
  await Promise.all([
    sendAll(accountSubs.filter((s) => s.customerId !== null && similarSet.has(s.customerId)), (l) => toPush(l, notice("newCakeSimilar"))),
    sendAll(accountSubs.filter((s) => s.customerId === null || !similarSet.has(s.customerId)), (l) => toPush(l, notice("newCake"))),
    sendAll(guests.filter((g) => g.favorites.length > 0), (l) => toPush(l, notice("newCakeSimilar"))),
    sendAll(guests.filter((g) => g.favorites.length === 0), (l) => toPush(l, notice("newCake"))),
  ]);
}

// After staff saved a cake: tells the people who hearted it about what changed, and announces a
// cake that just went on sale for the first time. "notify" off = only remember that the new
// cake was dealt with, tell nobody. Never throws: it must not block the staff action.
export async function notifyProductFans(before: ProductSnapshot, after: ProductSnapshot, notify: boolean): Promise<void> {
  try {
    const today = vietnamToday();
    if (!after.announced && canOrder(after, today)) {
      await prisma.product.update({ where: { id: after.id }, data: { announced: true } });
      if (notify) await announceNewCake(after);
    }
    if (!notify) return;
    const event = fanEvent(before, after, today);
    if (!event) return;

    const fans = await prisma.favorite.findMany({
      where: {
        productId: after.id,
        OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lt: new Date(Date.now() - FAN_GAP_MS) } }],
      },
      select: { id: true, customerId: true, subscriptionId: true },
    });
    if (fans.length === 0) return;
    await prisma.favorite.updateMany({ where: { id: { in: fans.map((fan) => fan.id) } }, data: { lastNotifiedAt: new Date() } });

    const notice: Notice = {
      kind: `favorite.${event.key}`,
      values: event.values,
      path: `/menu/${after.slug}`,
      tag: `favorite-${after.id}`,
    };
    const customerIds = fans.flatMap((fan) => (fan.customerId ? [fan.customerId] : []));
    const subscriptionIds = fans.flatMap((fan) => (fan.subscriptionId ? [fan.subscriptionId] : []));
    await saveToBell(customerIds, notice);
    await sendAll(await subscriptionsFor(customerIds, subscriptionIds), (locale) => toPush(locale, notice));
  } catch (error) {
    console.error("Favorite cake notification failed:", error);
  }
}
