import { Router, type Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdminRole, requireStaff } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { deleteImageByUrl, isOwnImageUrl } from "../lib/storage";
import { formatDateOnly, parseDateOnly } from "../lib/time";

export const adminHomeRouter = Router();
// Admins only. The paths are listed because this router shares /api/admin with other routers.
adminHomeRouter.use(["/home", "/seasons", "/coming-soon"], requireStaff, requireAdminRole);

// ---------- Validation ----------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const idParam = z.coerce.number().int().positive();
const dateText = z.string().refine((value) => parseDateOnly(value) !== null, "Use the format YYYY-MM-DD");

const contentSchema = z.object({
  announcementLeftVi: optionalText(80),
  announcementLeftEn: optionalText(80),
  announcementCenterVi: optionalText(140),
  announcementCenterEn: optionalText(140),
  announcementRightVi: optionalText(80),
  announcementRightEn: optionalText(80),
  announcementProductId: z.number().int().positive().nullable(),
  heroIsActive: z.boolean(),
  heroEyebrowVi: optionalText(60),
  heroEyebrowEn: optionalText(60),
  heroTitleVi: optionalText(90),
  heroTitleEn: optionalText(90),
  heroSubtitleVi: optionalText(220),
  heroSubtitleEn: optionalText(220),
  heroCtaVi: optionalText(30),
  heroCtaEn: optionalText(30),
  heroImageUrl: z.string().trim().max(500).refine(isOwnImageUrl, "Upload the photo with the upload button").nullable(),
  heroProductId: z.number().int().positive().nullable(),
});

const seasonSchema = z
  .object({
    nameVi: requiredText(60),
    nameEn: requiredText(60),
    eyebrowVi: optionalText(40),
    eyebrowEn: optionalText(40),
    descriptionVi: optionalText(300),
    descriptionEn: optionalText(300),
    startDate: dateText,
    endDate: dateText,
    isActive: z.boolean(),
    productIds: z.array(z.number().int().positive()).max(30),
  })
  .refine((season) => season.endDate >= season.startDate, {
    path: ["endDate"],
    message: "The season must end on or after its first day",
  });

const comingSoonSchema = z.object({
  dateLabel: requiredText(30),
  nameVi: requiredText(60),
  nameEn: requiredText(60),
  noteVi: optionalText(120),
  noteEn: optionalText(120),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
});

function badRequest(res: Response, error?: z.ZodError) {
  res.status(400).json({
    error: "VALIDATION_ERROR",
    details: error?.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) ?? [],
  });
}

function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

// A product id sent by the browser must point to a real product.
async function productsExist(ids: (number | null)[]): Promise<boolean> {
  const wanted = [...new Set(ids.filter((id): id is number => id !== null))];
  if (wanted.length === 0) return true;
  const found = await prisma.product.count({ where: { id: { in: wanted } } });
  return found === wanted.length;
}

// Everything the admin homepage editor shows, in both languages.
async function loadBundle() {
  const [content, seasons, comingSoon, products] = await Promise.all([
    prisma.homeContent.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
    prisma.season.findMany({
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
      include: { products: { orderBy: { sortOrder: "asc" }, select: { productId: true } } },
    }),
    prisma.comingSoonItem.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.product.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, nameVi: true, nameEn: true, isActive: true },
    }),
  ]);
  const { id: _id, updatedAt: _updatedAt, ...contentFields } = content;
  return {
    content: contentFields,
    seasons: seasons.map(({ products: items, startDate, endDate, createdAt: _c, updatedAt: _u, ...season }) => ({
      ...season,
      startDate: formatDateOnly(startDate),
      endDate: formatDateOnly(endDate),
      productIds: items.map((item) => item.productId),
    })),
    comingSoon,
    products,
  };
}

// ---------- Homepage texts and banner ----------

// GET /api/admin/home
adminHomeRouter.get("/home", async (_req, res) => {
  res.json(await loadBundle());
});

// PUT /api/admin/home
adminHomeRouter.put("/home", async (req, res) => {
  const parsed = contentSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const data = parsed.data;
  if (!(await productsExist([data.heroProductId, data.announcementProductId]))) return badRequest(res);

  const previous = await prisma.homeContent.findUnique({ where: { id: 1 }, select: { heroImageUrl: true } });
  await prisma.homeContent.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  // The banner photo was replaced or removed: delete the old file.
  if (previous?.heroImageUrl && previous.heroImageUrl !== data.heroImageUrl) {
    void deleteImageByUrl(previous.heroImageUrl);
  }
  console.log(`Homepage updated by admin ${req.admin!.email}`);
  res.json(await loadBundle());
});

// ---------- Seasons ----------

function seasonData(input: z.infer<typeof seasonSchema>) {
  const { productIds: _productIds, startDate, endDate, ...fields } = input;
  return { ...fields, startDate: parseDateOnly(startDate)!, endDate: parseDateOnly(endDate)! };
}

async function replaceSeasonProducts(tx: Prisma.TransactionClient, seasonId: number, productIds: number[]) {
  await tx.seasonProduct.deleteMany({ where: { seasonId } });
  const unique = [...new Set(productIds)];
  if (unique.length > 0) {
    await tx.seasonProduct.createMany({
      data: unique.map((productId, index) => ({ seasonId, productId, sortOrder: index })),
    });
  }
}

// POST /api/admin/seasons
adminHomeRouter.post("/seasons", async (req, res) => {
  const parsed = seasonSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  if (!(await productsExist(parsed.data.productIds))) return badRequest(res);
  await prisma.$transaction(async (tx) => {
    const season = await tx.season.create({ data: seasonData(parsed.data) });
    await replaceSeasonProducts(tx, season.id, parsed.data.productIds);
  });
  console.log(`Season "${parsed.data.nameEn}" created by admin ${req.admin!.email}`);
  res.status(201).json(await loadBundle());
});

// PUT /api/admin/seasons/:id
adminHomeRouter.put("/seasons/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const parsed = seasonSchema.safeParse(req.body);
  if (!id.success) return badRequest(res);
  if (!parsed.success) return badRequest(res, parsed.error);
  if (!(await productsExist(parsed.data.productIds))) return badRequest(res);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.season.update({ where: { id: id.data }, data: seasonData(parsed.data) });
      await replaceSeasonProducts(tx, id.data, parsed.data.productIds);
    });
  } catch (error) {
    if (isNotFound(error)) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    throw error;
  }
  console.log(`Season ${id.data} updated by admin ${req.admin!.email}`);
  res.json(await loadBundle());
});

// DELETE /api/admin/seasons/:id
adminHomeRouter.delete("/seasons/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return badRequest(res);
  try {
    await prisma.season.delete({ where: { id: id.data } });
  } catch (error) {
    if (isNotFound(error)) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    throw error;
  }
  console.log(`Season ${id.data} deleted by admin ${req.admin!.email}`);
  res.json(await loadBundle());
});

// ---------- Coming soon ----------

// POST /api/admin/coming-soon
adminHomeRouter.post("/coming-soon", async (req, res) => {
  const parsed = comingSoonSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  await prisma.comingSoonItem.create({ data: parsed.data });
  res.status(201).json(await loadBundle());
});

// PUT /api/admin/coming-soon/:id
adminHomeRouter.put("/coming-soon/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const parsed = comingSoonSchema.safeParse(req.body);
  if (!id.success) return badRequest(res);
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    await prisma.comingSoonItem.update({ where: { id: id.data }, data: parsed.data });
  } catch (error) {
    if (isNotFound(error)) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    throw error;
  }
  res.json(await loadBundle());
});

// DELETE /api/admin/coming-soon/:id
adminHomeRouter.delete("/coming-soon/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return badRequest(res);
  try {
    await prisma.comingSoonItem.delete({ where: { id: id.data } });
  } catch (error) {
    if (isNotFound(error)) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    throw error;
  }
  res.json(await loadBundle());
});
