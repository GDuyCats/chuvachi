import { Router, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { rateLimitKey } from "../lib/client-ip";
import { currentCustomerId, requireCustomer } from "../lib/customer-auth";
import { ImageError, receiveSingleImage, storeImage } from "../lib/image-upload";
import { parseLocale } from "../lib/locale";
import { isStorageConfigured } from "../lib/storage";
import { notifyLowReview, notifyNewPhotos, notifyReported } from "../services/notifications";
import {
  addComment,
  checkCanAddCommentPhoto,
  checkCanAddReviewPhoto,
  cleanText,
  COMMENT_PHOTO_FOLDER,
  deleteOwnComment,
  hasLink,
  productReviews,
  report,
  ReviewError,
  reviewableByCode,
  REVIEW_PHOTO_FOLDER,
  reviewableForCustomer,
  reviewComments,
  saveReview,
  vote,
} from "../services/review-service";

// Reviews (only by people who bought the cake), comments and replies (signed-in customers),
// up/down votes and reports (signed-in customers).
export const reviewsRouter = Router();

const limiter = (limit: number, minutes: number) =>
  rateLimit({
    windowMs: minutes * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: rateLimitKey,
    message: { error: "TOO_MANY_REQUESTS" },
  });

const reviewLimiter = limiter(15, 15);
const commentLimiter = limiter(20, 10);
const voteLimiter = limiter(120, 10);
const reportLimiter = limiter(20, 60);
const photoLimiter = limiter(30, 60);

const PHOTO_MAX_SIDE = 1600; // longest side after resizing, in pixels

const REPORT_ALERT_AT = 3; // tell staff when something gets this many reports

function fail(res: Response, error: unknown) {
  if (error instanceof ReviewError) {
    res.status(error.status).json({ error: error.code });
    return;
  }
  throw error;
}

const idParam = z.coerce.number().int().positive();
const codeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,12}$/);
const phoneSchema = z.string().trim().min(8).max(20);

// POST /api/reviews/eligible  { code, phone }  - cakes of this order that can be reviewed
reviewsRouter.post("/reviews/eligible", reviewLimiter, async (req, res) => {
  const parsed = z.object({ code: codeSchema, phone: phoneSchema.optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  try {
    const customerId = await currentCustomerId(req);
    res.json(await reviewableByCode(parsed.data.code, parsed.data.phone ?? null, customerId, parseLocale(req.query.locale)));
  } catch (error) {
    fail(res, error);
  }
});

// GET /api/account/reviewable - delivered orders of the signed-in customer, to review
reviewsRouter.get("/account/reviewable", requireCustomer, async (req, res) => {
  res.json(await reviewableForCustomer(req.customerId!, parseLocale(req.query.locale)));
});

const reviewSchema = z.object({
  code: codeSchema,
  phone: phoneSchema.optional(),
  productSlug: z.string().trim().min(1).max(80),
  rating: z.number().int().min(1).max(5),
  body: z.string().max(2000).optional(),
  photos: z.array(z.string().url().max(500)).max(10).optional(),
});

// Stores the uploaded photo of a request that passed its checks, and answers { url }.
async function savePhoto(req: Request, res: Response, folder: string) {
  if (!req.file) {
    res.status(400).json({ error: "NO_FILE" });
    return;
  }
  try {
    res.status(201).json({ url: await storeImage(req.file.buffer, folder, PHOTO_MAX_SIDE) });
  } catch (error) {
    if (error instanceof ImageError) {
      res.status(400).json({ error: "UNSUPPORTED_IMAGE" });
      return;
    }
    throw error;
  }
}

// POST /api/reviews/photos  multipart: image + code, phone?, productSlug
// A photo for a review; only for someone who may review that cake of that order.
// The photo is only shown once the review is saved with it.
reviewsRouter.post("/reviews/photos", photoLimiter, receiveSingleImage, async (req, res) => {
  if (!isStorageConfigured()) {
    res.status(503).json({ error: "STORAGE_NOT_CONFIGURED" });
    return;
  }
  const parsed = z
    .object({ code: codeSchema, phone: phoneSchema.optional(), productSlug: z.string().trim().min(1).max(80) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  try {
    const customerId = await currentCustomerId(req);
    await checkCanAddReviewPhoto(parsed.data.code, parsed.data.phone ?? null, parsed.data.productSlug, customerId);
  } catch (error) {
    fail(res, error);
    return;
  }
  await savePhoto(req, res, REVIEW_PHOTO_FOLDER);
});

// POST /api/reviews/:id/comment-photo  multipart: image
// A photo for a comment; only for signed-in customers who bought this cake.
reviewsRouter.post("/reviews/:id/comment-photo", photoLimiter, requireCustomer, receiveSingleImage, async (req, res) => {
  if (!isStorageConfigured()) {
    res.status(503).json({ error: "STORAGE_NOT_CONFIGURED" });
    return;
  }
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  try {
    await checkCanAddCommentPhoto(id.data, req.customerId!);
  } catch (error) {
    fail(res, error);
    return;
  }
  await savePhoto(req, res, COMMENT_PHOTO_FOLDER);
});

// POST /api/reviews - write or edit the review of one cake in one delivered order
reviewsRouter.post("/reviews", reviewLimiter, async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const body = parsed.data.body ? cleanText(parsed.data.body) : "";
  if (hasLink(body)) {
    res.status(400).json({ error: "LINKS_NOT_ALLOWED" });
    return;
  }
  try {
    const customerId = await currentCustomerId(req);
    const { review, isNew, productName, addedPhotos } = await saveReview(
      { ...parsed.data, phone: parsed.data.phone ?? null, body: body || null, photos: parsed.data.photos ?? [] },
      customerId,
    );
    if (isNew && review.rating <= 2) {
      void notifyLowReview(productName, review.rating, review.body).catch((e: unknown) =>
        console.error("Low review alert failed:", e),
      );
    }
    if (addedPhotos > 0) {
      void notifyNewPhotos(productName, addedPhotos).catch((e: unknown) => console.error("Photo alert failed:", e));
    }
    res
      .status(isNew ? 201 : 200)
      .json({ id: review.id, rating: review.rating, body: review.body, photos: review.photos });
  } catch (error) {
    fail(res, error);
  }
});

// GET /api/products/:slug/reviews?sort=top|new&locale=vi
reviewsRouter.get("/products/:slug/reviews", async (req, res) => {
  const sort = req.query.sort === "new" ? "new" : "top";
  try {
    const customerId = await currentCustomerId(req);
    res.json(await productReviews(String(req.params.slug), sort, parseLocale(req.query.locale), customerId));
  } catch (error) {
    fail(res, error);
  }
});

// GET /api/reviews/:id/comments
reviewsRouter.get("/reviews/:id/comments", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  try {
    res.json(await reviewComments(id.data, await currentCustomerId(req)));
  } catch (error) {
    fail(res, error);
  }
});

const commentSchema = z.object({
  body: z.string().max(1000),
  parentId: z.number().int().positive().nullable().optional(),
  photoUrl: z.string().url().max(500).nullable().optional(),
});

// POST /api/reviews/:id/comments  { body, parentId? } - signed-in customers only
reviewsRouter.post("/reviews/:id/comments", commentLimiter, requireCustomer, async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const parsed = commentSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const body = cleanText(parsed.data.body);
  const photoUrl = parsed.data.photoUrl ?? null;
  if (body.length === 0 && photoUrl === null) {
    res.status(400).json({ error: "EMPTY" });
    return;
  }
  if (hasLink(body)) {
    res.status(400).json({ error: "LINKS_NOT_ALLOWED" });
    return;
  }
  try {
    const comment = await addComment(id.data, parsed.data.parentId ?? null, body || null, photoUrl, req.customerId!);
    if (comment.photoUrl) {
      void notifyNewPhotos(null, 1).catch((e: unknown) => console.error("Photo alert failed:", e));
    }
    res.status(201).json(await reviewComments(id.data, req.customerId!));
  } catch (error) {
    fail(res, error);
  }
});

// DELETE /api/reviews/comments/:id - delete your own comment
reviewsRouter.delete("/reviews/comments/:id", requireCustomer, async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  try {
    await deleteOwnComment(id.data, req.customerId!);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

const voteSchema = z.object({ value: z.union([z.literal(-1), z.literal(0), z.literal(1)]) });

// POST /api/reviews/:id/vote and /api/reviews/comments/:id/vote  { value: 1 | 0 | -1 }
reviewsRouter.post("/reviews/:id/vote", voteLimiter, requireCustomer, async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const parsed = voteSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  try {
    await vote({ reviewId: id.data }, parsed.data.value, req.customerId!);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

reviewsRouter.post("/reviews/comments/:id/vote", voteLimiter, requireCustomer, async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const parsed = voteSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  try {
    await vote({ commentId: id.data }, parsed.data.value, req.customerId!);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

// POST /api/reviews/:id/report and /api/reviews/comments/:id/report
reviewsRouter.post("/reviews/:id/report", reportLimiter, requireCustomer, async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  try {
    const count = await report({ reviewId: id.data }, req.customerId!);
    if (count === REPORT_ALERT_AT) void notifyReported().catch((e: unknown) => console.error("Report alert failed:", e));
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

reviewsRouter.post("/reviews/comments/:id/report", reportLimiter, requireCustomer, async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  try {
    const count = await report({ commentId: id.data }, req.customerId!);
    if (count === REPORT_ALERT_AT) void notifyReported().catch((e: unknown) => console.error("Report alert failed:", e));
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});
