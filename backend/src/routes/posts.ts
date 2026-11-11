import { Prisma, PostCategory } from "@prisma/client";
import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAdminRole, requireStaff } from "../lib/auth";
import { rateLimitKey } from "../lib/client-ip";
import { currentCustomerId, requireCustomer } from "../lib/customer-auth";
import { parseLocale, pickText, type Locale } from "../lib/locale";
import { prisma } from "../lib/prisma";
import { deleteImageByUrl, isOwnImageInFolder, isOwnImageUrl } from "../lib/storage";
import { notifyPostReply } from "../services/customer-push";
import { notifyReported } from "../services/notifications";
import { cleanText, hasLink, shortName } from "../services/review-service";

// The News page: public list and single post, and the admin editor behind it.

const POST_IMAGE_FOLDER = "posts";
const LIST_SIZE = 60;

// ---------- Helpers ----------

// "Bánh Trung Thu 2026!" -> "banh-trung-thu-2026"
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// The start of a post as plain text, for cards without a written summary.
function excerpt(body: string, max = 220): string {
  const plain = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links -> their text
    .replace(/^#+\s*/gm, "") // headings
    .replace(/^\s*(?:[-*]|\d+\.)\s+/gm, "") // list markers
    .replace(/[*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

// Our own photos used inside a post (Markdown images), so unused ones can be deleted.
function imagesIn(text: string | null): string[] {
  if (!text) return [];
  return [...text.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((url) => isOwnImageInFolder(url, POST_IMAGE_FOLDER));
}

const visibleNow = () => ({ isPublished: true, publishAt: { lte: new Date() } });

type PostRow = Prisma.PostGetPayload<object>;

function toCard(post: PostRow, locale: Locale) {
  const body = pickText(locale, post.bodyVi, post.bodyEn) ?? post.bodyVi;
  return {
    slug: post.slug,
    category: post.category,
    title: pickText(locale, post.titleVi, post.titleEn) ?? post.titleVi,
    summary: pickText(locale, post.summaryVi, post.summaryEn) ?? excerpt(body),
    coverImageUrl: post.coverImageUrl,
    publishedAt: post.publishAt.toISOString(),
    pinned: post.isPinned,
  };
}

// ---------- Public ----------

export const postsRouter = Router();

// GET /api/posts?locale=vi - published posts, pinned first, newest first
postsRouter.get("/posts", async (req, res) => {
  const locale = parseLocale(req.query.locale);
  const posts = await prisma.post.findMany({
    where: visibleNow(),
    orderBy: [{ isPinned: "desc" }, { publishAt: "desc" }, { id: "desc" }],
    take: LIST_SIZE,
  });
  res.json(posts.map((post) => toCard(post, locale)));
});

// GET /api/posts/:slug?locale=vi - one published post with its full text
postsRouter.get("/posts/:slug", async (req, res) => {
  const locale = parseLocale(req.query.locale);
  const post = await prisma.post.findFirst({ where: { slug: String(req.params.slug), ...visibleNow() } });
  if (!post) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  res.json({
    ...toCard(post, locale),
    body: pickText(locale, post.bodyVi, post.bodyEn) ?? post.bodyVi,
    allowComments: post.allowComments,
  });
});

// ---------- Comments (public) ----------

const SHOP_NAME = "Chuvachi";
const limiter = (limit: number, minutes: number) =>
  rateLimit({
    windowMs: minutes * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: rateLimitKey,
    message: { error: "TOO_MANY_REQUESTS" },
  });
const commentLimiter = limiter(20, 15);
const reportLimiter = limiter(20, 60);
const commentSchema = z.object({ body: z.string().max(1000), parentId: z.number().int().positive().nullable().optional() });

async function visiblePost(slug: string) {
  return prisma.post.findFirst({ where: { slug, ...visibleNow() }, select: { id: true, allowComments: true } });
}

// Comments in the order they were written. Hidden ones are left out; a deleted comment
// stays as "deleted" only while someone's reply still hangs under it.
async function publicComments(postId: number, customerId: number | null) {
  const rows = await prisma.postComment.findMany({
    where: { postId, hiddenAt: null },
    orderBy: { createdAt: "asc" },
  });
  const liveReplies = new Set(rows.filter((r) => r.parentId !== null && !r.deletedAt).map((r) => r.parentId));
  return rows
    .filter((r) => !r.deletedAt || (r.parentId === null && liveReplies.has(r.id)))
    .map((r) => ({
      id: r.id,
      parentId: r.parentId,
      displayName: r.displayName,
      isShop: r.adminUserId !== null,
      body: r.deletedAt ? null : r.body,
      deleted: r.deletedAt !== null,
      createdAt: r.createdAt.toISOString(),
      mine: customerId !== null && r.customerId === customerId,
    }));
}

// The parent a new comment hangs under: a reply to a reply goes under the same top comment.
async function topParent(postId: number, parentId: number | null | undefined): Promise<number | null | "BAD"> {
  if (!parentId) return null;
  const parent = await prisma.postComment.findFirst({ where: { id: parentId, postId, hiddenAt: null } });
  if (!parent) return "BAD";
  return parent.parentId ?? parent.id;
}

// GET /api/posts/:slug/comments
postsRouter.get("/posts/:slug/comments", async (req, res) => {
  const post = await visiblePost(String(req.params.slug));
  if (!post) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  const customerId = await currentCustomerId(req);
  res.json({ allowComments: post.allowComments, comments: await publicComments(post.id, customerId) });
});

// POST /api/posts/:slug/comments  { body, parentId? } - signed-in customers
postsRouter.post("/posts/:slug/comments", commentLimiter, requireCustomer, async (req, res) => {
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const post = await visiblePost(String(req.params.slug));
  if (!post) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  if (!post.allowComments) {
    res.status(403).json({ error: "COMMENTS_OFF" });
    return;
  }
  const body = cleanText(parsed.data.body);
  if (!body) {
    res.status(400).json({ error: "EMPTY" });
    return;
  }
  if (hasLink(body)) {
    res.status(400).json({ error: "LINKS_NOT_ALLOWED" });
    return;
  }
  const parentId = await topParent(post.id, parsed.data.parentId);
  if (parentId === "BAD") {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  const customer = await prisma.customer.findUnique({ where: { id: req.customerId! }, select: { name: true } });
  const comment = await prisma.postComment.create({
    data: { postId: post.id, parentId, customerId: req.customerId!, displayName: shortName(customer?.name ?? ""), body },
  });
  void notifyPostReply(comment.id);
  res.status(201).json({ allowComments: true, comments: await publicComments(post.id, req.customerId!) });
});

// DELETE /api/posts/comments/:id - the writer deletes their own comment
postsRouter.delete("/posts/comments/:id", requireCustomer, async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return badRequest(res);
  const result = await prisma.postComment.updateMany({
    where: { id: id.data, customerId: req.customerId!, deletedAt: null },
    data: { deletedAt: new Date(), body: null },
  });
  if (result.count === 0) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  res.json({ ok: true });
});

// POST /api/posts/comments/:id/report - one report per customer; staff are told at the threshold
postsRouter.post("/posts/comments/:id/report", reportLimiter, requireCustomer, async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return badRequest(res);
  const comment = await prisma.postComment.findFirst({ where: { id: id.data, hiddenAt: null, deletedAt: null } });
  if (!comment) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  const created = await prisma.postCommentReport.createMany({
    data: [{ commentId: comment.id, customerId: req.customerId! }],
    skipDuplicates: true,
  });
  if (created.count > 0) {
    const updated = await prisma.postComment.update({
      where: { id: comment.id },
      data: { reportCount: { increment: 1 } },
      select: { reportCount: true },
    });
    const settings = await prisma.shopSetting.findUnique({ where: { id: 1 }, select: { reportAlertThreshold: true } });
    if (updated.reportCount === (settings?.reportAlertThreshold ?? 3)) {
      void notifyReported("/admin/posts").catch((e: unknown) => console.error("Report alert failed:", e));
    }
  }
  res.json({ ok: true });
});

// ---------- Admin ----------

export const adminPostsRouter = Router();
adminPostsRouter.use(requireStaff, requireAdminRole);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

const postSchema = z.object({
  slug: z.string().trim().max(80).optional(), // empty = made from the Vietnamese title
  category: z.nativeEnum(PostCategory),
  titleVi: z.string().trim().min(1).max(140),
  titleEn: optionalText(140),
  summaryVi: optionalText(400),
  summaryEn: optionalText(400),
  bodyVi: z.string().trim().min(1).max(40_000),
  bodyEn: optionalText(40_000),
  coverImageUrl: z.string().trim().max(500).refine(isOwnImageUrl, "Upload the photo with the upload button").nullable(),
  isPublished: z.boolean(),
  isPinned: z.boolean(),
  allowComments: z.boolean(),
  publishAt: z.string().datetime({ offset: true }),
});

const idParam = z.coerce.number().int().positive();

function badRequest(res: Response, error?: z.ZodError) {
  res.status(400).json({
    error: "VALIDATION_ERROR",
    details: error?.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) ?? [],
  });
}

function toAdmin(post: PostRow) {
  return { ...post, publishAt: post.publishAt.toISOString(), createdAt: post.createdAt.toISOString(), updatedAt: post.updatedAt.toISOString() };
}

async function listAll() {
  const posts = await prisma.post.findMany({
    orderBy: [{ isPinned: "desc" }, { publishAt: "desc" }, { id: "desc" }],
    include: {
      _count: { select: { comments: { where: { deletedAt: null } } } },
      comments: { where: { reportCount: { gt: 0 }, hiddenAt: null, deletedAt: null }, select: { id: true } },
    },
  });
  return posts.map(({ _count, comments, ...post }) => ({
    ...toAdmin(post),
    commentCount: _count.comments,
    reportedComments: comments.length,
  }));
}

// Deletes photos the old version used and the new one doesn't.
async function cleanUpImages(before: PostRow, after: PostRow | null) {
  const keep = new Set(
    after ? [after.coverImageUrl, ...imagesIn(after.bodyVi), ...imagesIn(after.bodyEn)].filter(Boolean) : [],
  );
  const old = [before.coverImageUrl, ...imagesIn(before.bodyVi), ...imagesIn(before.bodyEn)].filter(
    (url): url is string => Boolean(url),
  );
  for (const url of new Set(old)) {
    if (!keep.has(url)) void deleteImageByUrl(url).catch((e: unknown) => console.error("Post image cleanup failed:", e));
  }
}

function postData(input: z.infer<typeof postSchema>) {
  const { slug, publishAt, ...fields } = input;
  return { ...fields, slug: slugify(slug || input.titleVi) || `post-${Date.now()}`, publishAt: new Date(publishAt) };
}

function isSlugTaken(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// GET /api/admin/posts - every post, drafts and scheduled ones too
adminPostsRouter.get("/", async (_req, res) => {
  res.json(await listAll());
});

// POST /api/admin/posts
adminPostsRouter.post("/", async (req, res) => {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    await prisma.post.create({ data: postData(parsed.data) });
  } catch (error) {
    if (isSlugTaken(error)) {
      res.status(409).json({ error: "SLUG_TAKEN" });
      return;
    }
    throw error;
  }
  console.log(`Post "${parsed.data.titleVi}" created by admin ${req.admin!.email}`);
  res.status(201).json(await listAll());
});

// PUT /api/admin/posts/:id
adminPostsRouter.put("/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const parsed = postSchema.safeParse(req.body);
  if (!id.success) return badRequest(res);
  if (!parsed.success) return badRequest(res, parsed.error);
  const before = await prisma.post.findUnique({ where: { id: id.data } });
  if (!before) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  let after: PostRow;
  try {
    after = await prisma.post.update({ where: { id: id.data }, data: postData(parsed.data) });
  } catch (error) {
    if (isSlugTaken(error)) {
      res.status(409).json({ error: "SLUG_TAKEN" });
      return;
    }
    throw error;
  }
  await cleanUpImages(before, after);
  res.json(await listAll());
});

// DELETE /api/admin/posts/:id
adminPostsRouter.delete("/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return badRequest(res);
  const before = await prisma.post.findUnique({ where: { id: id.data } });
  if (!before) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  await prisma.post.delete({ where: { id: id.data } });
  await cleanUpImages(before, null);
  console.log(`Post ${id.data} deleted by admin ${req.admin!.email}`);
  res.json(await listAll());
});

// ---------- Comments (admin) ----------

// GET /api/admin/posts/:id/comments - every comment, hidden ones too
adminPostsRouter.get("/:id/comments", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return badRequest(res);
  const rows = await prisma.postComment.findMany({
    where: { postId: id.data },
    orderBy: { createdAt: "asc" },
    include: { adminUser: { select: { name: true } } },
  });
  res.json(
    rows.map((r) => ({
      id: r.id,
      parentId: r.parentId,
      displayName: r.adminUserId ? `${SHOP_NAME} (${r.adminUser?.name ?? ""})` : r.displayName,
      isShop: r.adminUserId !== null,
      body: r.body,
      deleted: r.deletedAt !== null,
      hidden: r.hiddenAt !== null,
      reportCount: r.reportCount,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

// POST /api/admin/posts/comments/:id/hide  { hidden } - showing again also clears the reports
adminPostsRouter.post("/comments/:id/hide", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const parsed = z.object({ hidden: z.boolean() }).safeParse(req.body);
  if (!id.success || !parsed.success) return badRequest(res);
  const result = await prisma.postComment.updateMany({
    where: { id: id.data },
    data: parsed.data.hidden ? { hiddenAt: new Date() } : { hiddenAt: null, reportCount: 0 },
  });
  if (result.count === 0) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  res.json({ ok: true });
});

// POST /api/admin/posts/:id/comments  { body, parentId? } - answer as the shop
adminPostsRouter.post("/:id/comments", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const parsed = commentSchema.safeParse(req.body);
  if (!id.success) return badRequest(res);
  if (!parsed.success) return badRequest(res, parsed.error);
  const body = cleanText(parsed.data.body);
  if (!body) {
    res.status(400).json({ error: "EMPTY" });
    return;
  }
  const parentId = await topParent(id.data, parsed.data.parentId);
  if (parentId === "BAD") {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  const comment = await prisma.postComment.create({
    data: { postId: id.data, parentId, adminUserId: req.admin!.id, displayName: SHOP_NAME, body },
  });
  void notifyPostReply(comment.id);
  res.status(201).json({ ok: true });
});
