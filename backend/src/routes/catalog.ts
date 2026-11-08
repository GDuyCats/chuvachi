import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { Locale, parseLocale, pickText } from "../lib/locale";
import { formatDateOnly } from "../lib/time";
import { soldPortionsByProduct } from "../lib/sales";

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
function toProductResponse(product: ProductWithRelations, locale: Locale, soldCount: number | null = null) {
  return {
    id: product.id,
    slug: product.slug,
    name: pickText(locale, product.nameVi, product.nameEn),
    description: pickText(locale, product.descriptionVi, product.descriptionEn),
    ingredients: pickText(locale, product.ingredientsVi, product.ingredientsEn),
    allergens: pickText(locale, product.allergensVi, product.allergensEn),
    imageUrl: product.imageUrl,
    // All photos in order (older products may only have the cover photo).
    images: product.images.length > 0 ? product.images : product.imageUrl ? [product.imageUrl] : [],
    basePrice: product.basePrice,
    isNew: product.isNew,
    // AVAILABLE, SOLD_OUT or COMING_SOON; only AVAILABLE can be ordered
    availability: product.availability,
    // Last day the cake can't be delivered ("temporarily sold out"), or null
    soldOutUntil: product.soldOutUntil ? formatDateOnly(product.soldOutUntil) : null,
    // Portions sold so far; null when the shop hides it or the number is still below the minimum
    soldCount,
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
      availability: option.availability,
    })),
  };
}

// Sold counts to show for these products, following the "show sold count" setting.
async function visibleSoldCounts(productIds: number[]): Promise<Map<number, number>> {
  const settings = await prisma.shopSetting.findUnique({ where: { id: 1 } });
  if (!settings?.showSoldCount) return new Map();
  const counts = await soldPortionsByProduct(productIds);
  return new Map([...counts].filter(([, count]) => count > 0 && count >= settings.soldCountMinimum));
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

  const sold = await visibleSoldCounts(products.map((product) => product.id));
  res.json(products.map((product) => toProductResponse(product, locale, sold.get(product.id) ?? null)));
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

  const sold = await visibleSoldCounts([product.id]);
  res.json(toProductResponse(product, locale, sold.get(product.id) ?? null));
});
