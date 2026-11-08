import { OrderStatus, type CustomerPushSubscription } from "@prisma/client";
import text from "../content/customer-alerts.json";
import { parseLocale, pickText, type Locale } from "../lib/locale";
import { prisma } from "../lib/prisma";
import { deliverPush, isPushConfigured, type PushMessage } from "../lib/push";

// Push notifications to customers: their order changed status, or someone answered their
// review or comment. Messages carry only the order code, the cake's name and the public
// short names already shown on the website; never a phone number or address.

const KEEP_TRYING_SECONDS = 12 * 60 * 60; // a phone that is off still gets it within half a day
const WATCH_DAYS = 45; // guests follow an order this long after it is finished (covers the review window)

type Subscription = CustomerPushSubscription;
type StatusKey = keyof typeof text.vi.status;

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

function shorten(value: string, max = 100): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
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
    const subscriptions = await subscriptionsForOrder(order.id, order.customerId);
    await sendAll(subscriptions, (locale) => ({
      title: fill(text[locale].status[key].title, { code: order.code }),
      body: text[locale].status[key].body,
      url: `/${locale}/track?code=${order.code}`,
      tag: `order-${order.code}`,
    }));
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
    const notMine = (s: Subscription) => writer === null || s.customerId !== writer;

    const reviewOwnerSubs = (await subscriptionsForOrder(comment.review.orderId, comment.review.customerId)).filter(
      (s) => notMine(s) && (writer === null || comment.review.customerId !== writer),
    );
    const parentAuthor = comment.parent?.customerId ?? null;
    const parentSubs =
      parentAuthor !== null && parentAuthor !== writer
        ? (await prisma.customerPushSubscription.findMany({ where: { customerId: parentAuthor } })).filter(
            (s) => !reviewOwnerSubs.some((r) => r.id === s.id),
          )
        : [];

    const product = comment.review.product;
    const build = (kind: "reviewReply" | "commentReply") => (locale: Locale) => ({
      title: fill(text[locale][kind].title, { name: comment.displayName }),
      body: fill(text[locale][kind].body, {
        product: pickText(locale, product.nameVi, product.nameEn),
        text: comment.body ? shorten(comment.body) : text[locale].photo,
      }),
      url: `/${locale}/menu/${product.slug}#reviews`,
      tag: `review-${comment.reviewId}`,
    });
    await Promise.all([sendAll(reviewOwnerSubs, build("reviewReply")), sendAll(parentSubs, build("commentReply"))]);
  } catch (error) {
    console.error("Comment notification failed:", error);
  }
}

// A short "it works" message right after a device is switched on.
export async function sendWelcome(subscriptionId: number): Promise<boolean> {
  const subscription = await prisma.customerPushSubscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription) return false;
  const sent = await sendAll([subscription], (locale) => ({ ...text[locale].welcome, url: `/${locale}`, tag: "welcome" }));
  return sent > 0;
}

// Guests stop following orders that finished long ago (run from the hourly job).
export async function purgeOldOrderWatches(): Promise<number> {
  const cutoff = new Date(Date.now() - WATCH_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.orderPushWatch.deleteMany({
    where: {
      order: { status: { in: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] }, updatedAt: { lt: cutoff } },
    },
  });
  // Browsers with no account and nothing left to follow are not needed any more.
  await prisma.customerPushSubscription.deleteMany({ where: { customerId: null, watches: { none: {} } } });
  return result.count;
}
