import { OrderStatus, Prisma } from "@prisma/client";
import { pickText, type Locale } from "../lib/locale";
import { normalizePhone } from "../lib/phone";
import { prisma } from "../lib/prisma";
import { deleteImageByUrl, isOwnImageInFolder } from "../lib/storage";
import { formatDateOnly, vietnamToday } from "../lib/time";

// Reviews can only be written for a cake in a delivered order, for this many days after delivery.
// How long buyers may review and how many photos they may add are set in the admin
// (Settings > Reviews); these are only used if the settings row is missing.
const DEFAULT_REVIEW_WINDOW_DAYS = 30;
const DEFAULT_MAX_REVIEW_PHOTOS = 4;
export const REVIEW_PHOTO_FOLDER = "reviews";
export const COMMENT_PHOTO_FOLDER = "comments";
const DAY_MS = 24 * 60 * 60 * 1000;

export class ReviewError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(code);
  }
}

// "Nguyễn Thị Ngọc Anh" -> "Anh N." : enough to feel real, not enough to identify someone.
export function shortName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Guest";
  if (words.length === 1) return words[0].slice(0, 20);
  return `${words[words.length - 1].slice(0, 20)} ${words[0][0].toUpperCase()}.`;
}

type NamePair = { nameVi: string; nameEn: string };
function namePair(value: unknown): NamePair | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  return typeof v.nameVi === "string" && typeof v.nameEn === "string" ? { nameVi: v.nameVi, nameEn: v.nameEn } : null;
}

// "Matcha · Box of 4" from an order line's saved options (without the cake's own name).
function optionText(snapshot: Prisma.JsonValue, locale: Locale): string | null {
  const data = (typeof snapshot === "object" && snapshot !== null && !Array.isArray(snapshot) ? snapshot : {}) as Record<string, unknown>;
  const parts = [namePair(data.flavor), namePair(data.package)]
    .filter((pair): pair is NamePair => pair !== null)
    .map((pair) => pickText(locale, pair.nameVi, pair.nameEn));
  return parts.length > 0 ? parts.join(" · ") : null;
}

const orderInclude = {
  items: { include: { product: { select: { id: true, slug: true, nameVi: true, nameEn: true, imageUrl: true } } } },
  reviews: true,
} satisfies Prisma.OrderInclude;

type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

type ReviewRules = { windowDays: number; maxPhotos: number };

export async function reviewRules(): Promise<ReviewRules> {
  const settings = await prisma.shopSetting.findUnique({
    where: { id: 1 },
    select: { reviewWindowDays: true, maxReviewPhotos: true },
  });
  return {
    windowDays: settings?.reviewWindowDays ?? DEFAULT_REVIEW_WINDOW_DAYS,
    maxPhotos: settings?.maxReviewPhotos ?? DEFAULT_MAX_REVIEW_PHOTOS,
  };
}

function reviewDeadline(order: { deliveryDate: Date }, rules: ReviewRules): Date {
  return new Date(order.deliveryDate.getTime() + rules.windowDays * DAY_MS);
}

function whyNot(order: OrderWithItems, rules: ReviewRules): "NOT_DELIVERED" | "TOO_LATE" | null {
  if (order.status !== OrderStatus.COMPLETED) return "NOT_DELIVERED";
  if (vietnamToday() > reviewDeadline(order, rules)) return "TOO_LATE";
  return null;
}

// The cakes of one order that can be (or already were) reviewed.
function toReviewable(order: OrderWithItems, locale: Locale, rules: ReviewRules) {
  const byProduct = new Map<number, { product: NonNullable<OrderWithItems["items"][number]["product"]>; options: string[] }>();
  for (const item of order.items) {
    if (!item.product) continue;
    const entry = byProduct.get(item.product.id) ?? { product: item.product, options: [] };
    const options = optionText(item.optionsSnapshot, locale);
    if (options && !entry.options.includes(options)) entry.options.push(options);
    byProduct.set(item.product.id, entry);
  }
  const reason = whyNot(order, rules);
  return {
    code: order.code,
    deliveryDate: formatDateOnly(order.deliveryDate),
    deadline: formatDateOnly(reviewDeadline(order, rules)),
    canReview: reason === null,
    reason,
    maxPhotos: rules.maxPhotos,
    items: [...byProduct.values()].map(({ product, options }) => {
      const review = order.reviews.find((r) => r.productId === product.id);
      return {
        productSlug: product.slug,
        name: pickText(locale, product.nameVi, product.nameEn),
        options: options.join(", ") || null,
        imageUrl: product.imageUrl,
        review: review ? { id: review.id, rating: review.rating, body: review.body, photos: review.photos } : null,
      };
    }),
  };
}

// Order found by code and phone (guests), or by code for the signed-in owner.
async function findOrder(code: string, phone: string | null, customerId: number | null): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({ where: { code: code.toUpperCase() }, include: orderInclude });
  const owner = order && customerId !== null && order.customerId === customerId;
  const phoneMatches = order && phone && order.customerPhone === normalizePhone(phone);
  if (!order || (!owner && !phoneMatches)) throw new ReviewError("ORDER_NOT_FOUND", 404);
  return order;
}

export async function reviewableByCode(code: string, phone: string | null, customerId: number | null, locale: Locale) {
  const [order, rules] = await Promise.all([findOrder(code, phone, customerId), reviewRules()]);
  return toReviewable(order, locale, rules);
}

// Delivered orders of a signed-in customer that still have cakes to review (or reviews to edit).
export async function reviewableForCustomer(customerId: number, locale: Locale) {
  const rules = await reviewRules();
  const since = new Date(vietnamToday().getTime() - rules.windowDays * DAY_MS);
  const orders = await prisma.order.findMany({
    where: { customerId, status: OrderStatus.COMPLETED, deliveryDate: { gte: since } },
    include: orderInclude,
    orderBy: { deliveryDate: "desc" },
    take: 20,
  });
  return orders.map((order) => toReviewable(order, locale, rules));
}

// Throws unless this person may review this cake of this order right now (checked before a photo upload too).
async function reviewTarget(code: string, phone: string | null, productSlug: string, customerId: number | null) {
  const [order, rules] = await Promise.all([findOrder(code, phone, customerId), reviewRules()]);
  const reason = whyNot(order, rules);
  if (reason) throw new ReviewError(reason, 409);
  const item = order.items.find((i) => i.product?.slug === productSlug);
  if (!item?.product) throw new ReviewError("NOT_IN_ORDER", 409);
  return { order, item, product: item.product, rules };
}

export async function checkCanAddReviewPhoto(code: string, phone: string | null, productSlug: string, customerId: number | null) {
  const { rules } = await reviewTarget(code, phone, productSlug, customerId);
  if (rules.maxPhotos === 0) throw new ReviewError("TOO_MANY_PHOTOS");
}

// Removes photo files nobody uses any more (a URL could have been copied into another review or comment).
async function deleteUnusedPhotos(urls: string[]): Promise<void> {
  for (const url of urls) {
    const [inReviews, inComments] = await Promise.all([
      prisma.review.count({ where: { photos: { has: url } } }),
      prisma.reviewComment.count({ where: { photoUrl: url } }),
    ]);
    if (inReviews === 0 && inComments === 0) await deleteImageByUrl(url);
  }
}

export type ReviewInput = {
  code: string;
  phone: string | null;
  productSlug: string;
  rating: number;
  body: string | null;
  photos: string[];
};

// Writes a review, or updates the earlier one for the same cake in the same order.
export async function saveReview(input: ReviewInput, customerId: number | null) {
  const { order, product, rules } = await reviewTarget(input.code, input.phone, input.productSlug, customerId);
  const productId = product.id;

  const photos = [...new Set(input.photos)];
  if (photos.length > rules.maxPhotos) throw new ReviewError("TOO_MANY_PHOTOS");
  if (!photos.every((url) => isOwnImageInFolder(url, REVIEW_PHOTO_FOLDER))) throw new ReviewError("BAD_PHOTO");

  // The name shown with the review: the account name if the order belongs to an account.
  const customer = order.customerId ? await prisma.customer.findUnique({ where: { id: order.customerId } }) : null;
  const options = order.items.filter((i) => i.productId === productId);
  const flavorVi = [...new Set(options.map((i) => optionText(i.optionsSnapshot, "vi")).filter(Boolean))].join(", ") || null;
  const flavorEn = [...new Set(options.map((i) => optionText(i.optionsSnapshot, "en")).filter(Boolean))].join(", ") || null;

  const existing = order.reviews.find((r) => r.productId === productId);
  const data = { rating: input.rating, body: input.body, photos };
  const review = existing
    ? await prisma.review.update({ where: { id: existing.id }, data })
    : await prisma.review.create({
        data: {
          ...data,
          productId,
          orderId: order.id,
          customerId: order.customerId,
          displayName: shortName(customer?.name ?? order.customerName),
          flavor: flavorVi,
          flavorEn,
        },
      });
  const before = existing?.photos ?? [];
  const removed = before.filter((url) => !photos.includes(url));
  if (removed.length > 0) void deleteUnusedPhotos(removed).catch((e: unknown) => console.error("Photo cleanup failed:", e));
  const addedPhotos = photos.filter((url) => !before.includes(url)).length;
  return { review, isNew: !existing, productName: product.nameVi, addedPhotos };
}

// ---------- Deleting ----------

// Photo files of these reviews and of all comments under them (deleted together with the reviews).
async function photosOfReviews(reviewIds: number[]): Promise<string[]> {
  if (reviewIds.length === 0) return [];
  const [reviews, comments] = await Promise.all([
    prisma.review.findMany({ where: { id: { in: reviewIds } }, select: { photos: true } }),
    prisma.reviewComment.findMany({ where: { reviewId: { in: reviewIds }, photoUrl: { not: null } }, select: { photoUrl: true } }),
  ]);
  return [...reviews.flatMap((r) => r.photos), ...comments.flatMap((c) => (c.photoUrl ? [c.photoUrl] : []))];
}

// Deletes reviews for good, with their comments, votes, reports and photo files.
export async function deleteReviews(reviewIds: number[]): Promise<number> {
  const photos = await photosOfReviews(reviewIds);
  const result = await prisma.review.deleteMany({ where: { id: { in: reviewIds } } });
  await removePhotoFiles(photos);
  return result.count;
}

// The buyer deletes their own review (no time limit, as long as they can still open the order).
export async function deleteOwnReview(code: string, phone: string | null, productSlug: string, customerId: number | null) {
  const order = await findOrder(code, phone, customerId);
  const item = order.items.find((i) => i.product?.slug === productSlug);
  const review = item?.product ? order.reviews.find((r) => r.productId === item.product?.id) : undefined;
  if (!review) throw new ReviewError("NOT_FOUND", 404);
  await deleteReviews([review.id]);
}

// Before an account is deleted: remove its reviews (with everything under them) and the photos of
// its comments. The comments themselves are deleted together with the account.
export async function deleteCustomerReviewContent(customerId: number): Promise<void> {
  const reviews = await prisma.review.findMany({ where: { customerId }, select: { id: true } });
  await deleteReviews(reviews.map((r) => r.id));
  const comments = await prisma.reviewComment.findMany({
    where: { customerId, photoUrl: { not: null } },
    select: { id: true, photoUrl: true },
  });
  if (comments.length > 0) {
    await prisma.reviewComment.updateMany({ where: { id: { in: comments.map((c) => c.id) } }, data: { photoUrl: null } });
    await removePhotoFiles(comments.flatMap((c) => (c.photoUrl ? [c.photoUrl] : [])));
  }
}

// A signed-in customer counts as a buyer of a cake once an order of theirs with it was delivered.
async function isBuyer(customerId: number, productId: number): Promise<boolean> {
  const order = await prisma.order.findFirst({
    where: { customerId, status: OrderStatus.COMPLETED, items: { some: { productId } } },
    select: { id: true },
  });
  return order !== null;
}

// Throws unless this customer may attach a photo to a comment under this review.
export async function checkCanAddCommentPhoto(reviewId: number, customerId: number) {
  const review = await prisma.review.findFirst({ where: { id: reviewId, hiddenAt: null }, select: { productId: true } });
  if (!review) throw new ReviewError("NOT_FOUND", 404);
  if (!(await isBuyer(customerId, review.productId))) throw new ReviewError("PHOTO_BUYERS_ONLY", 403);
}

// ---------- Reading ----------

const visible = { hiddenAt: null } satisfies Prisma.ReviewWhereInput;

// Average stars and number of visible reviews for each product.
export async function ratingsByProduct(productIds: number[]): Promise<Map<number, { average: number; count: number }>> {
  if (productIds.length === 0) return new Map();
  const rows = await prisma.review.groupBy({
    by: ["productId"],
    where: { ...visible, productId: { in: productIds } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return new Map(
    rows.map((row) => [row.productId, { average: Math.round((row._avg.rating ?? 0) * 10) / 10, count: row._count._all }]),
  );
}

export async function productReviews(slug: string, sort: "top" | "new", locale: Locale, customerId: number | null) {
  const product = await prisma.product.findFirst({ where: { slug, isActive: true }, select: { id: true } });
  if (!product) throw new ReviewError("NOT_FOUND", 404);

  const reviews = await prisma.review.findMany({
    where: { ...visible, productId: product.id },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const ids = reviews.map((r) => r.id);
  const [commentCounts, shopReplies, myVotes] = await Promise.all([
    prisma.reviewComment.groupBy({
      by: ["reviewId"],
      where: { reviewId: { in: ids }, hiddenAt: null, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.reviewComment.findMany({
      where: { reviewId: { in: ids }, adminUserId: { not: null }, hiddenAt: null, deletedAt: null },
      select: { reviewId: true },
    }),
    customerId
      ? prisma.reviewVote.findMany({ where: { customerId, reviewId: { in: ids } }, select: { reviewId: true, value: true } })
      : Promise.resolve([]),
  ]);
  const counts = new Map(commentCounts.map((row) => [row.reviewId, row._count._all]));
  const replied = new Set(shopReplies.map((row) => row.reviewId));
  const votes = new Map(myVotes.map((row) => [row.reviewId, row.value]));

  const distribution = [1, 2, 3, 4, 5].map((stars) => reviews.filter((r) => r.rating === stars).length);
  const average = reviews.length > 0 ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10 : 0;

  const rows = reviews.map((review) => ({
    id: review.id,
    displayName: review.displayName,
    rating: review.rating,
    body: review.body,
    flavor: locale === "en" ? (review.flavorEn ?? review.flavor) : review.flavor,
    createdAt: review.createdAt.toISOString(),
    edited: review.updatedAt.getTime() - review.createdAt.getTime() > 60_000,
    upvotes: review.upvotes,
    downvotes: review.downvotes,
    score: review.upvotes - review.downvotes,
    commentCount: counts.get(review.id) ?? 0,
    shopReplied: replied.has(review.id),
    myVote: votes.get(review.id) ?? 0,
    photos: review.photos,
  }));
  if (sort === "top") {
    rows.sort((a, b) => b.score - a.score || (b.body ? 1 : 0) - (a.body ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));
  }
  // Lets the page show the "add a photo" button in comments only to people who bought this cake.
  const canAddPhoto = customerId !== null && (await isBuyer(customerId, product.id));
  return { summary: { average, count: reviews.length, distribution }, reviews: rows, viewer: { canAddPhoto } };
}

export async function reviewComments(reviewId: number, customerId: number | null) {
  const review = await prisma.review.findFirst({ where: { id: reviewId, ...visible }, select: { id: true } });
  if (!review) throw new ReviewError("NOT_FOUND", 404);
  const comments = await prisma.reviewComment.findMany({
    where: { reviewId, hiddenAt: null },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  const myVotes = customerId
    ? await prisma.reviewVote.findMany({
        where: { customerId, commentId: { in: comments.map((c) => c.id) } },
        select: { commentId: true, value: true },
      })
    : [];
  const votes = new Map(myVotes.map((row) => [row.commentId, row.value]));
  const visibleIds = new Set(comments.map((c) => c.id));
  const hasReplies = new Set(comments.filter((c) => c.parentId && !c.deletedAt).map((c) => c.parentId));

  return comments
    // Drop deleted comments nobody replied to, and replies whose parent is hidden.
    .filter((c) => (!c.deletedAt || hasReplies.has(c.id)) && (c.parentId === null || visibleIds.has(c.parentId)))
    .map((c) => ({
      id: c.id,
      parentId: c.parentId,
      displayName: c.displayName,
      isShop: c.adminUserId !== null,
      body: c.deletedAt ? null : c.body,
      photoUrl: c.deletedAt ? null : c.photoUrl,
      deleted: c.deletedAt !== null,
      createdAt: c.createdAt.toISOString(),
      upvotes: c.upvotes,
      downvotes: c.downvotes,
      myVote: votes.get(c.id) ?? 0,
      mine: customerId !== null && c.customerId === customerId,
    }));
}

// ---------- Comments, votes and reports ----------

// No links: almost all comment spam is advertising.
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|vn|org|io|xyz|info|top)\b)/i;

export function cleanText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

export function hasLink(value: string): boolean {
  return LINK.test(value);
}

export async function addComment(
  reviewId: number,
  parentId: number | null,
  body: string | null,
  photoUrl: string | null,
  customerId: number,
) {
  const review = await prisma.review.findFirst({ where: { id: reviewId, ...visible }, select: { id: true } });
  if (!review) throw new ReviewError("NOT_FOUND", 404);
  if (photoUrl !== null) {
    if (!isOwnImageInFolder(photoUrl, COMMENT_PHOTO_FOLDER)) throw new ReviewError("BAD_PHOTO");
    await checkCanAddCommentPhoto(reviewId, customerId);
  }

  // Only two levels: a reply to a reply is attached to the top comment.
  let topId: number | null = null;
  if (parentId !== null) {
    const parent = await prisma.reviewComment.findFirst({ where: { id: parentId, reviewId, hiddenAt: null } });
    if (!parent) throw new ReviewError("NOT_FOUND", 404);
    topId = parent.parentId ?? parent.id;
  }
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  return prisma.reviewComment.create({
    data: { reviewId, parentId: topId, customerId, displayName: shortName(customer.name), body, photoUrl },
  });
}

export async function deleteOwnComment(commentId: number, customerId: number) {
  const comment = await prisma.reviewComment.findFirst({ where: { id: commentId, customerId, deletedAt: null } });
  if (!comment) throw new ReviewError("NOT_FOUND", 404);
  await prisma.reviewComment.update({
    where: { id: comment.id },
    data: { deletedAt: new Date(), body: null, photoUrl: null },
  });
  if (comment.photoUrl) await removePhotoFiles([comment.photoUrl]);
}

// Deletes photo files that no review or comment uses any more. Failures are only logged.
export async function removePhotoFiles(urls: string[]): Promise<void> {
  await deleteUnusedPhotos(urls).catch((e: unknown) => console.error("Photo cleanup failed:", e));
}

type Target = { reviewId: number } | { commentId: number };

// value: 1 = up, -1 = down, 0 = take my vote back. Counts are kept on the review or comment.
export async function vote(target: Target, value: -1 | 0 | 1, customerId: number) {
  return prisma.$transaction(async (tx) => {
    const isReview = "reviewId" in target;
    const exists = isReview
      ? await tx.review.findFirst({ where: { id: target.reviewId, hiddenAt: null }, select: { id: true } })
      : await tx.reviewComment.findFirst({ where: { id: target.commentId, hiddenAt: null, deletedAt: null }, select: { id: true } });
    if (!exists) throw new ReviewError("NOT_FOUND", 404);

    const where = isReview
      ? { customerId_reviewId: { customerId, reviewId: target.reviewId } }
      : { customerId_commentId: { customerId, commentId: target.commentId } };
    const previous = await tx.reviewVote.findUnique({ where });
    const old = previous?.value ?? 0;
    if (old === value) return;

    if (value === 0) await tx.reviewVote.delete({ where });
    else if (previous) await tx.reviewVote.update({ where, data: { value } });
    else if (isReview) await tx.reviewVote.create({ data: { customerId, value, reviewId: target.reviewId } });
    else await tx.reviewVote.create({ data: { customerId, value, commentId: target.commentId } });

    const change = {
      upvotes: { increment: (value === 1 ? 1 : 0) - (old === 1 ? 1 : 0) },
      downvotes: { increment: (value === -1 ? 1 : 0) - (old === -1 ? 1 : 0) },
    };
    if (isReview) await tx.review.update({ where: { id: target.reviewId }, data: change });
    else await tx.reviewComment.update({ where: { id: target.commentId }, data: change });
  });
}

// Returns the new number of reports (0 when this person had already reported it).
export async function report(target: Target, customerId: number): Promise<number> {
  try {
    if ("reviewId" in target) await prisma.reviewReport.create({ data: { customerId, reviewId: target.reviewId } });
    else await prisma.reviewReport.create({ data: { customerId, commentId: target.commentId } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return 0;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") throw new ReviewError("NOT_FOUND", 404);
    throw error;
  }
  const updated =
    "reviewId" in target
      ? await prisma.review.update({ where: { id: target.reviewId }, data: { reportCount: { increment: 1 } } })
      : await prisma.reviewComment.update({ where: { id: target.commentId }, data: { reportCount: { increment: 1 } } });
  return updated.reportCount;
}
