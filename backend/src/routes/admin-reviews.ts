import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireStaff } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { notifyNewComment } from "../services/customer-push";
import { cleanText, deleteReviews, removePhotoFiles } from "../services/review-service";

// Moderating reviews and comments (admins and staff): hide or show them, answer as the shop.
export const adminReviewsRouter = Router();
adminReviewsRouter.use(requireStaff);

const SHOP_NAME = "Chuvachi";
const idParam = z.coerce.number().int().positive();
const filterSchema = z.enum(["all", "reported", "low", "photos", "hidden"]).default("all");

// GET /api/admin/reviews?filter=all|reported|low|photos|hidden
adminReviewsRouter.get("/", async (req, res) => {
  const filter = filterSchema.safeParse(req.query.filter);
  if (!filter.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const where: Prisma.ReviewWhereInput =
    filter.data === "reported"
      ? { reportCount: { gt: 0 }, hiddenAt: null }
      : filter.data === "low"
        ? { rating: { lte: 2 } }
        : filter.data === "photos"
          ? // Reviews with photos, or with a comment that has a photo
            { OR: [{ photos: { isEmpty: false } }, { comments: { some: { photoUrl: { not: null } } } }] }
          : filter.data === "hidden"
            ? { hiddenAt: { not: null } }
            : {};
  const reviews = await prisma.review.findMany({
    where,
    orderBy: filter.data === "reported" ? [{ reportCount: "desc" }, { createdAt: "desc" }] : { createdAt: "desc" },
    take: 100,
    include: {
      product: { select: { nameVi: true, nameEn: true, slug: true } },
      order: { select: { code: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { adminUser: { select: { name: true } } },
      },
    },
  });
  // Comments that were reported, so staff see them even under quiet reviews.
  const reportedComments =
    filter.data === "reported"
      ? await prisma.reviewComment.findMany({
          where: { reportCount: { gt: 0 }, hiddenAt: null, deletedAt: null },
          orderBy: { reportCount: "desc" },
          take: 100,
          include: { review: { select: { id: true, product: { select: { nameVi: true, nameEn: true } } } } },
        })
      : [];

  res.json({
    reviews: reviews.map((review) => ({
      id: review.id,
      product: { nameVi: review.product.nameVi, nameEn: review.product.nameEn, slug: review.product.slug },
      orderCode: review.order.code,
      displayName: review.displayName,
      rating: review.rating,
      body: review.body,
      flavor: review.flavor,
      photos: review.photos,
      upvotes: review.upvotes,
      downvotes: review.downvotes,
      reportCount: review.reportCount,
      hidden: review.hiddenAt !== null,
      createdAt: review.createdAt.toISOString(),
      comments: review.comments.map((comment) => ({
        id: comment.id,
        parentId: comment.parentId,
        displayName: comment.adminUserId ? `${SHOP_NAME} (${comment.adminUser?.name ?? ""})` : comment.displayName,
        isShop: comment.adminUserId !== null,
        body: comment.body,
        photoUrl: comment.photoUrl,
        deleted: comment.deletedAt !== null,
        hidden: comment.hiddenAt !== null,
        reportCount: comment.reportCount,
        createdAt: comment.createdAt.toISOString(),
      })),
    })),
    reportedComments: reportedComments.map((comment) => ({
      id: comment.id,
      reviewId: comment.review.id,
      product: comment.review.product,
      displayName: comment.displayName,
      body: comment.body,
      photoUrl: comment.photoUrl,
      reportCount: comment.reportCount,
      createdAt: comment.createdAt.toISOString(),
    })),
  });
});

const hideSchema = z.object({ hidden: z.boolean() });

// POST /api/admin/reviews/:id/hide  { hidden }  - "show" also clears the reports (checked by staff)
adminReviewsRouter.post("/:id/hide", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const parsed = hideSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const result = await prisma.review.updateMany({
    where: { id: id.data },
    data: parsed.data.hidden ? { hiddenAt: new Date() } : { hiddenAt: null, reportCount: 0 },
  });
  if (result.count === 0) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  console.log(`Review ${id.data} ${parsed.data.hidden ? "hidden" : "shown"} by ${req.admin!.email}`);
  res.json({ ok: true });
});

// POST /api/admin/reviews/comments/:id/hide  { hidden }
adminReviewsRouter.post("/comments/:id/hide", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const parsed = hideSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const result = await prisma.reviewComment.updateMany({
    where: { id: id.data },
    data: parsed.data.hidden ? { hiddenAt: new Date() } : { hiddenAt: null, reportCount: 0 },
  });
  if (result.count === 0) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  console.log(`Review comment ${id.data} ${parsed.data.hidden ? "hidden" : "shown"} by ${req.admin!.email}`);
  res.json({ ok: true });
});

// DELETE /api/admin/reviews/:id - deletes a review for good (e.g. the customer asked for it)
adminReviewsRouter.delete("/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  if ((await deleteReviews([id.data])) === 0) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  console.log(`Review ${id.data} deleted by ${req.admin!.email}`);
  res.json({ ok: true });
});

const photoSchema = z.object({ url: z.string().max(500) });

// POST /api/admin/reviews/:id/photos/remove  { url } - takes one photo off a review (the text stays)
adminReviewsRouter.post("/:id/photos/remove", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const parsed = photoSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const review = await prisma.review.findUnique({ where: { id: id.data }, select: { photos: true } });
  if (!review || !review.photos.includes(parsed.data.url)) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  await prisma.review.update({
    where: { id: id.data },
    data: { photos: review.photos.filter((url) => url !== parsed.data.url) },
  });
  await removePhotoFiles([parsed.data.url]);
  console.log(`Photo removed from review ${id.data} by ${req.admin!.email}`);
  res.json({ ok: true });
});

// POST /api/admin/reviews/comments/:id/photo/remove - takes the photo off a comment (the text stays)
adminReviewsRouter.post("/comments/:id/photo/remove", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const comment = await prisma.reviewComment.findUnique({ where: { id: id.data }, select: { photoUrl: true } });
  if (!comment?.photoUrl) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  await prisma.reviewComment.update({ where: { id: id.data }, data: { photoUrl: null } });
  await removePhotoFiles([comment.photoUrl]);
  console.log(`Photo removed from review comment ${id.data} by ${req.admin!.email}`);
  res.json({ ok: true });
});

// POST /api/admin/reviews/:id/reply  { body, parentId? }  - answer as the shop
adminReviewsRouter.post("/:id/reply", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const parsed = z
    .object({ body: z.string().max(1000), parentId: z.number().int().positive().nullable().optional() })
    .safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const body = cleanText(parsed.data.body);
  if (!body) {
    res.status(400).json({ error: "EMPTY" });
    return;
  }
  const review = await prisma.review.findUnique({ where: { id: id.data }, select: { id: true } });
  if (!review) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  let parentId: number | null = null;
  if (parsed.data.parentId) {
    const parent = await prisma.reviewComment.findFirst({ where: { id: parsed.data.parentId, reviewId: review.id } });
    if (!parent) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    parentId = parent.parentId ?? parent.id; // still only two levels
  }
  const comment = await prisma.reviewComment.create({
    data: { reviewId: review.id, parentId, adminUserId: req.admin!.id, displayName: SHOP_NAME, body },
  });
  void notifyNewComment(comment.id);
  res.status(201).json({ ok: true });
});
