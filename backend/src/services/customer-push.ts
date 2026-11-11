import { OrderStatus, Prisma, type CustomerPushSubscription } from "@prisma/client";
import text from "../content/customer-alerts.json";
import { parseLocale, pickText, type Locale } from "../lib/locale";
import { prisma } from "../lib/prisma";
import { deliverPush, isPushConfigured, type PushMessage } from "../lib/push";

// Notifications to customers: their order changed status, or someone answered their review
// or comment. Each one goes to the bell list on the website (signed-in customers) and as a
// push notification to the browsers that switched them on. Messages carry only the order
// code, the cake's name and public short names; never a phone number or address.

const KEEP_TRYING_SECONDS = 12 * 60 * 60; // a phone that is off still gets it within half a day
const WATCH_DAYS = 45; // guests follow an order this long after it is finished (covers the review window)
const BELL_KEEP_DAYS = 90; // bell list entries older than this are deleted

type Subscription = CustomerPushSubscription;
type StatusKey = keyof typeof text.vi.status;
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
  return { title: "Chuvachi", body: "" };
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
  // Browsers with no account and nothing left to follow are not needed any more.
  await prisma.customerPushSubscription.deleteMany({ where: { customerId: null, watches: { none: {} } } });
  await prisma.customerNotification.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - BELL_KEEP_DAYS * 24 * 60 * 60 * 1000) } },
  });
  return result.count;
}
