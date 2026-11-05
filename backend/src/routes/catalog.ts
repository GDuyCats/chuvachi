import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { Locale, parseLocale, pickText } from "../lib/locale";

export const catalogRouter = Router();

const productInclude = {
  category: true,
  options: {
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

// Turns a database product into the shape the frontend needs, in one language.
function toProductResponse(product: ProductWithRelations, locale: Locale) {
  return {
    id: product.id,
    slug: product.slug,
    name: pickText(locale, product.nameVi, product.nameEn),
    description: pickText(locale, product.descriptionVi, product.descriptionEn),
    imageUrl: product.imageUrl,
    basePrice: product.basePrice,
    category: {
      slug: product.category.slug,
      name: pickText(locale, product.category.nameVi, product.category.nameEn),
    },
    options: product.options.map((option) => ({
      id: option.id,
      type: option.type,
      name: pickText(locale, option.nameVi, option.nameEn),
      priceDelta: option.priceDelta,
      portions: option.portions,
    })),
  };
}

// GET /api/categories?locale=vi|en
catalogRouter.get("/categories", async (req, res) => {
  const locale = parseLocale(req.query.locale);
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
  });

  res.json(
    categories.map((category) => ({
      id: category.id,
      slug: category.slug,
      name: pickText(locale, category.nameVi, category.nameEn),
    })),
  );
});

// GET /api/products?locale=vi|en&category=<category-slug>
catalogRouter.get("/products", async (req, res) => {
  const locale = parseLocale(req.query.locale);
  const categorySlug = typeof req.query.category === "string" ? req.query.category : undefined;

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(categorySlug ? { category: { slug: categorySlug } } : {}),
    },
    include: productInclude,
    orderBy: { sortOrder: "asc" },
  });

  res.json(products.map((product) => toProductResponse(product, locale)));
});

// GET /api/products/:slug?locale=vi|en
catalogRouter.get("/products/:slug", async (req, res) => {
  const locale = parseLocale(req.query.locale);

  const product = await prisma.product.findFirst({
    where: { slug: req.params.slug, isActive: true },
    include: productInclude,
  });

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json(toProductResponse(product, locale));
});

// GET /api/delivery-zones?locale=vi|en
catalogRouter.get("/delivery-zones", async (req, res) => {
  const locale = parseLocale(req.query.locale);
  const zones = await prisma.deliveryZone.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  res.json(
    zones.map((zone) => ({
      id: zone.id,
      name: pickText(locale, zone.nameVi, zone.nameEn),
      fee: zone.fee,
    })),
  );
});
