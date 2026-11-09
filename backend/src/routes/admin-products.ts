import { Router, type Response } from "express";
import { Availability, OptionType, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdminRole, requireStaff } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { deleteImageByUrl, isOwnImageUrl } from "../lib/storage";
import { formatDateOnly, parseDateOnly } from "../lib/time";

export const adminProductsRouter = Router();
// Staff may read products and change stock (sold out, daily limit); everything else is for admins.
adminProductsRouter.use(["/products", "/categories"], requireStaff);

// ---------- Validation ----------

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes")
  .max(80);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

export const MAX_PRODUCT_IMAGES = 8;

const optionSchema = z.object({
  id: z.number().int().positive().optional(), // existing option; leave out for a new one
  type: z.nativeEnum(OptionType),
  nameVi: z.string().trim().min(1).max(80),
  nameEn: z.string().trim().min(1).max(80),
  priceDelta: z.number().int().min(-10_000_000).max(10_000_000),
  portions: z.number().int().min(1).max(100),
  isActive: z.boolean(),
  availability: z.nativeEnum(Availability).default("AVAILABLE"),
  dailyLimit: z.number().int().min(1).max(10_000).nullable().default(null), // flavors only
  sortOrder: z.number().int().min(0).max(1000),
});

const productSchema = z.object({
  slug: slugSchema,
  categoryId: z.number().int().positive(),
  nameVi: z.string().trim().min(1).max(100),
  nameEn: z.string().trim().min(1).max(100),
  descriptionVi: optionalText(1000),
  descriptionEn: optionalText(1000),
  ingredientsVi: optionalText(1000),
  ingredientsEn: optionalText(1000),
  allergensVi: optionalText(300),
  allergensEn: optionalText(300),
  // Photos in display order; the first one is the cover. Only files uploaded to our own storage.
  images: z
    .array(z.string().trim().max(500).refine(isOwnImageUrl, "Upload the photo with the upload button"))
    .max(MAX_PRODUCT_IMAGES),
  basePrice: z.number().int().min(0).max(100_000_000),
  // "Temporarily sold out" up to and including this day (YYYY-MM-DD), or null
  soldOutUntil: z
    .string()
    .refine((value) => parseDateOnly(value) !== null, "Use the format YYYY-MM-DD")
    .nullable(),
  dailyLimit: z.number().int().min(1).max(10_000).nullable(),
  availability: z.nativeEnum(Availability).default("AVAILABLE"),
  isActive: z.boolean(),
  isNew: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
  options: z.array(optionSchema).max(40),
});

const categorySchema = z.object({
  slug: slugSchema,
  nameVi: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().min(1).max(60),
  sortOrder: z.number().int().min(0).max(1000),
});

const idParam = z.coerce.number().int().positive();

function badRequest(res: Response, error?: z.ZodError) {
  res.status(400).json({
    error: "VALIDATION_ERROR",
    details: error?.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) ?? [],
  });
}

// Turns "slug already used" database errors into a clear message.
function isDuplicateSlug(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const productInclude = {
  category: true,
  options: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { id: "asc" }] },
} satisfies Prisma.ProductInclude;

function productData(input: z.infer<typeof productSchema>) {
  const { options: _options, categoryId, images, soldOutUntil, ...fields } = input;
  const unique = [...new Set(images)];
  return {
    ...fields,
    soldOutUntil: soldOutUntil ? parseDateOnly(soldOutUntil) : null,
    images: unique,
    imageUrl: unique[0] ?? null,
    category: { connect: { id: categoryId } },
  };
}

// Products saved before the photo list existed only have "imageUrl".
function photosOf(product: { images: string[]; imageUrl: string | null }): string[] {
  if (product.images.length > 0) return product.images;
  return product.imageUrl ? [product.imageUrl] : [];
}

function toAdminProduct<T extends { images: string[]; imageUrl: string | null; soldOutUntil: Date | null }>(product: T) {
  return {
    ...product,
    images: photosOf(product),
    soldOutUntil: product.soldOutUntil ? formatDateOnly(product.soldOutUntil) : null,
  };
}

// Updates options in place (so carts and old orders keep working), creates new ones,
// and switches off any option that was removed from the list instead of deleting it.
async function syncOptions(tx: Prisma.TransactionClient, productId: number, options: z.infer<typeof optionSchema>[]) {
  const existing = await tx.productOption.findMany({ where: { productId }, select: { id: true } });
  const existingIds = new Set(existing.map((o) => o.id));
  const keptIds = new Set<number>();

  for (const option of options) {
    const { id, ...fields } = option;
    const data = { ...fields, dailyLimit: fields.type === OptionType.FLAVOR ? fields.dailyLimit : null };
    if (id && existingIds.has(id)) {
      await tx.productOption.update({ where: { id }, data });
      keptIds.add(id);
    } else {
      await tx.productOption.create({ data: { ...data, productId } });
    }
  }

  const removed = [...existingIds].filter((id) => !keptIds.has(id));
  if (removed.length > 0) {
    await tx.productOption.updateMany({ where: { id: { in: removed } }, data: { isActive: false } });
  }
}

// ---------- Products ----------

// GET /api/admin/products - every product, including hidden ones
adminProductsRouter.get("/products", async (_req, res) => {
  const products = await prisma.product.findMany({
    include: productInclude,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  res.json(products.map(toAdminProduct));
});

// GET /api/admin/products/:id
adminProductsRouter.get("/products/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return badRequest(res);
  const product = await prisma.product.findUnique({ where: { id: id.data }, include: productInclude });
  if (!product) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  res.json(toAdminProduct(product));
});

// POST /api/admin/products
adminProductsRouter.post("/products", requireAdminRole, async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({ data: productData(parsed.data) });
      await syncOptions(tx, created.id, parsed.data.options);
      return tx.product.findUniqueOrThrow({ where: { id: created.id }, include: productInclude });
    });
    console.log(`Product ${product.slug} created by admin ${req.admin!.email}`);
    res.status(201).json(toAdminProduct(product));
  } catch (error) {
    if (isDuplicateSlug(error)) {
      res.status(409).json({ error: "SLUG_TAKEN" });
      return;
    }
    throw error;
  }
});

// PUT /api/admin/products/:id
adminProductsRouter.put("/products/:id", requireAdminRole, async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const parsed = productSchema.safeParse(req.body);
  if (!id.success) return badRequest(res);
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    const previous = await prisma.product.findUnique({ where: { id: id.data }, select: { imageUrl: true, images: true } });
    const product = await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: id.data }, data: productData(parsed.data) });
      await syncOptions(tx, id.data, parsed.data.options);
      return tx.product.findUniqueOrThrow({ where: { id: id.data }, include: productInclude });
    });
    console.log(`Product ${product.slug} updated by admin ${req.admin!.email}`);
    // Photos that were removed: delete their files from storage.
    if (previous) {
      const kept = new Set(product.images);
      for (const url of photosOf(previous)) {
        if (!kept.has(url)) void deleteImageByUrl(url);
      }
    }
    res.json(toAdminProduct(product));
  } catch (error) {
    if (isDuplicateSlug(error)) {
      res.status(409).json({ error: "SLUG_TAKEN" });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    throw error;
  }
});

const stockSchema = productSchema.pick({ soldOutUntil: true, dailyLimit: true, availability: true }).extend({
  // Availability of each flavor or box size, by option id
  options: z
    .array(
      z.object({
        id: z.number().int().positive(),
        availability: z.nativeEnum(Availability),
        dailyLimit: z.number().int().min(1).max(10_000).nullable().optional(), // flavors only
      }),
    )
    .max(40)
    .default([]),
});

// PUT /api/admin/products/:id/stock - availability, "sold out until" and "daily limit" only (allowed for staff)
adminProductsRouter.put("/products/:id/stock", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const parsed = stockSchema.safeParse(req.body);
  if (!id.success) return badRequest(res);
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    const product = await prisma.$transaction(async (tx) => {
      for (const option of parsed.data.options) {
        // updateMany with productId so an option of another cake can't be changed through this one
        await tx.productOption.updateMany({
          where: { id: option.id, productId: id.data },
          data: { availability: option.availability },
        });
        if (option.dailyLimit !== undefined) {
          await tx.productOption.updateMany({
            where: { id: option.id, productId: id.data, type: OptionType.FLAVOR },
            data: { dailyLimit: option.dailyLimit },
          });
        }
      }
      return tx.product.update({
        where: { id: id.data },
        data: {
          soldOutUntil: parsed.data.soldOutUntil ? parseDateOnly(parsed.data.soldOutUntil) : null,
          dailyLimit: parsed.data.dailyLimit,
          availability: parsed.data.availability,
        },
        include: productInclude,
      });
    });
    console.log(`Stock of ${product.slug} updated by ${req.admin!.email}`);
    res.json(toAdminProduct(product));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    throw error;
  }
});

// ---------- Categories ----------

// GET /api/admin/categories
adminProductsRouter.get("/categories", async (_req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  res.json(categories);
});

// POST /api/admin/categories
adminProductsRouter.post("/categories", requireAdminRole, async (req, res) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    res.status(201).json(await prisma.category.create({ data: parsed.data }));
  } catch (error) {
    if (isDuplicateSlug(error)) {
      res.status(409).json({ error: "SLUG_TAKEN" });
      return;
    }
    throw error;
  }
});

// PUT /api/admin/categories/:id
adminProductsRouter.put("/categories/:id", requireAdminRole, async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const parsed = categorySchema.safeParse(req.body);
  if (!id.success) return badRequest(res);
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    res.json(await prisma.category.update({ where: { id: id.data }, data: parsed.data }));
  } catch (error) {
    if (isDuplicateSlug(error)) {
      res.status(409).json({ error: "SLUG_TAKEN" });
      return;
    }
    throw error;
  }
});
