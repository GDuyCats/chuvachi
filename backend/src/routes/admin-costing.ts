import { IngredientKind, OptionType, Prisma } from "@prisma/client";
import { Router, type Response } from "express";
import { z } from "zod";
import { requireAdminRole, requireStaff } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { SOLD_ORDER } from "../lib/sales";
import { parseDateOnly } from "../lib/time";

// Cost of each cake: ingredients with their pack prices, a recipe per flavor (and per box for
// packaging), and the resulting cost and profit per portion / per box. Admins only.
export const adminCostingRouter = Router();
adminCostingRouter.use(requireStaff, requireAdminRole);

function badRequest(res: Response): void {
  res.status(400).json({ error: "VALIDATION_ERROR" });
}

const ingredientSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.nativeEnum(IngredientKind),
  unit: z.string().trim().min(1).max(12),
  packSize: z.number().positive().max(1_000_000),
  packPrice: z.number().int().min(0).max(100_000_000),
  note: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .transform((value) => value || null),
});

const recipeSchema = z.object({
  productId: z.number().int().positive(),
  optionId: z.number().int().positive().nullable(), // null = the product itself (no flavors)
  yieldCount: z.number().int().min(1).max(10_000),
  lines: z
    .array(z.object({ ingredientId: z.number().int().positive(), quantity: z.number().positive().max(1_000_000) }))
    .max(40),
});

const idParam = z.coerce.number().int().positive();

// ---------- Calculation ----------

type IngredientPrice = { id: number; packSize: number; packPrice: number };
type RecipeWithLines = { id: number; productId: number; optionId: number | null; yieldCount: number; lines: { ingredientId: number; quantity: number }[] };

// Cost of one portion (flavor recipe) or one box (packaging recipe), rounded to whole VND.
function perUnitCost(recipe: RecipeWithLines | undefined, prices: Map<number, IngredientPrice>): number | null {
  if (!recipe || recipe.lines.length === 0) return null;
  let total = 0;
  for (const line of recipe.lines) {
    const ingredient = prices.get(line.ingredientId);
    if (!ingredient) continue;
    total += (line.quantity * ingredient.packPrice) / ingredient.packSize;
  }
  return Math.round(total / recipe.yieldCount);
}

async function loadCostData() {
  const [ingredients, products, recipes] = await Promise.all([
    prisma.ingredient.findMany({ orderBy: [{ kind: "asc" }, { name: "asc" }], include: { _count: { select: { recipeLines: true } } } }),
    prisma.product.findMany({
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
      include: { options: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { id: "asc" }] } },
    }),
    prisma.costRecipe.findMany({ include: { lines: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } }),
  ]);
  const prices = new Map(ingredients.map((i) => [i.id, i]));
  const byOption = new Map(recipes.filter((r) => r.optionId !== null).map((r) => [r.optionId as number, r]));
  const byProduct = new Map(recipes.filter((r) => r.optionId === null).map((r) => [r.productId, r]));
  return { ingredients, products, recipes, prices, byOption, byProduct };
}

type CostData = Awaited<ReturnType<typeof loadCostData>>;

// For every product: cost per portion of each flavor, cost per box of each package,
// and the price, cost and profit of every flavor × package the shop sells.
function productCosts(data: CostData) {
  return data.products.map((product) => {
    const flavorOptions = product.options.filter((o) => o.type === OptionType.FLAVOR);
    const packageOptions = product.options.filter((o) => o.type === OptionType.PACKAGE);

    const flavors = flavorOptions.length
      ? flavorOptions.map((o) => ({
          optionId: o.id as number | null,
          nameVi: o.nameVi,
          nameEn: o.nameEn,
          priceDelta: o.priceDelta,
          isActive: o.isActive,
          costPerPortion: perUnitCost(data.byOption.get(o.id), data.prices),
        }))
      : [
          {
            optionId: null,
            nameVi: product.nameVi,
            nameEn: product.nameEn,
            priceDelta: 0,
            isActive: true,
            costPerPortion: perUnitCost(data.byProduct.get(product.id), data.prices),
          },
        ];
    const packages = packageOptions.length
      ? packageOptions.map((o) => ({
          optionId: o.id as number | null,
          nameVi: o.nameVi,
          nameEn: o.nameEn,
          priceDelta: o.priceDelta,
          portions: o.portions,
          isActive: o.isActive,
          costPerBox: perUnitCost(data.byOption.get(o.id), data.prices),
        }))
      : [{ optionId: null, nameVi: "1 phần", nameEn: "1 portion", priceDelta: 0, portions: 1, isActive: true, costPerBox: null }];

    // Same price rule as the shop: (base price + flavor extra) per portion, plus the box adjustment.
    const rows = flavors.flatMap((flavor) =>
      packages.map((pack) => {
        const price = (product.basePrice + flavor.priceDelta) * pack.portions + pack.priceDelta;
        const cost =
          flavor.costPerPortion === null ? null : flavor.costPerPortion * pack.portions + (pack.costPerBox ?? 0);
        return {
          flavorOptionId: flavor.optionId,
          packageOptionId: pack.optionId,
          portions: pack.portions,
          price,
          cost,
          profit: cost === null ? null : price - cost,
          margin: cost === null || price === 0 ? null : Math.round(((price - cost) / price) * 100),
          // packaging not costed yet while the shop sells boxes: the cost is too low
          missingPackaging: packageOptions.length > 0 && pack.costPerBox === null,
        };
      }),
    );

    return {
      id: product.id,
      nameVi: product.nameVi,
      nameEn: product.nameEn,
      isActive: product.isActive,
      basePrice: product.basePrice,
      hasFlavors: flavorOptions.length > 0,
      hasPackages: packageOptions.length > 0,
      flavors,
      packages,
      rows,
    };
  });
}

function bundle(data: CostData) {
  return {
    ingredients: data.ingredients.map(({ _count, ...i }) => ({ ...i, usedIn: _count.recipeLines })),
    recipes: data.recipes.map((r) => ({
      id: r.id,
      productId: r.productId,
      optionId: r.optionId,
      yieldCount: r.yieldCount,
      lines: r.lines.map((l) => ({ ingredientId: l.ingredientId, quantity: l.quantity })),
    })),
    products: productCosts(data),
  };
}

// GET /api/admin/costing - everything the costing page shows
adminCostingRouter.get("/", async (_req, res) => {
  res.json(bundle(await loadCostData()));
});

// ---------- Ingredients ----------

adminCostingRouter.post("/ingredients", async (req, res) => {
  const body = ingredientSchema.safeParse(req.body);
  if (!body.success) return badRequest(res);
  await prisma.ingredient.create({ data: body.data });
  res.status(201).json(bundle(await loadCostData()));
});

adminCostingRouter.put("/ingredients/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const body = ingredientSchema.safeParse(req.body);
  if (!id.success || !body.success) return badRequest(res);
  const result = await prisma.ingredient.updateMany({ where: { id: id.data }, data: body.data });
  if (result.count === 0) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  res.json(bundle(await loadCostData()));
});

// Refused while a recipe still uses it, so no cake silently gets cheaper.
adminCostingRouter.delete("/ingredients/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return badRequest(res);
  const used = await prisma.recipeLine.count({ where: { ingredientId: id.data } });
  if (used > 0) {
    res.status(409).json({ error: "INGREDIENT_IN_USE" });
    return;
  }
  await prisma.ingredient.deleteMany({ where: { id: id.data } });
  res.json(bundle(await loadCostData()));
});

// ---------- Recipes ----------

// PUT /api/admin/costing/recipes - creates or replaces the recipe of one flavor / box / product
adminCostingRouter.put("/recipes", async (req, res) => {
  const body = recipeSchema.safeParse(req.body);
  if (!body.success) return badRequest(res);
  const { productId, optionId, yieldCount, lines } = body.data;

  // The option must belong to the product; a recipe without option only for products without flavors.
  const product = await prisma.product.findUnique({ where: { id: productId }, include: { options: true } });
  if (!product) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  if (optionId !== null && !product.options.some((o) => o.id === optionId)) return badRequest(res);
  if (optionId === null && product.options.some((o) => o.type === OptionType.FLAVOR)) return badRequest(res);
  const known = await prisma.ingredient.count({ where: { id: { in: lines.map((l) => l.ingredientId) } } });
  if (known !== new Set(lines.map((l) => l.ingredientId)).size) return badRequest(res);

  await prisma.$transaction(async (tx) => {
    const existing =
      optionId !== null
        ? await tx.costRecipe.findUnique({ where: { optionId } })
        : await tx.costRecipe.findFirst({ where: { productId, optionId: null } });
    const recipe = existing
      ? await tx.costRecipe.update({ where: { id: existing.id }, data: { yieldCount } })
      : await tx.costRecipe.create({ data: { productId, optionId, yieldCount } });
    await tx.recipeLine.deleteMany({ where: { recipeId: recipe.id } });
    if (lines.length) {
      await tx.recipeLine.createMany({
        data: lines.map((line, index) => ({ recipeId: recipe.id, ingredientId: line.ingredientId, quantity: line.quantity, sortOrder: index })),
      });
    }
  });
  res.json(bundle(await loadCostData()));
});

// ---------- Estimated profit of what was sold ----------

const rangeQuery = z.object({
  from: z.string().refine((v) => parseDateOnly(v) !== null).optional(),
  to: z.string().refine((v) => parseDateOnly(v) !== null).optional(),
});

type Snapshot = { package?: { id?: number | null } | null } | null;
type MixPart = { optionId: number; portions: number };

// GET /api/admin/costing/sold?from=&to=
// Sold portions per product with revenue and the cost by today's recipes and prices (an estimate).
adminCostingRouter.get("/sold", async (req, res) => {
  const query = rangeQuery.safeParse(req.query);
  if (!query.success) return badRequest(res);
  const from = query.data.from ? parseDateOnly(query.data.from)! : null;
  const to = query.data.to ? parseDateOnly(query.data.to)! : null;

  const data = await loadCostData();
  const flavorCost = new Map<number, number | null>();
  const boxCost = new Map<number, number | null>();
  const plainCost = new Map<number, number | null>();
  for (const product of productCosts(data)) {
    for (const f of product.flavors) {
      if (f.optionId === null) plainCost.set(product.id, f.costPerPortion);
      else flavorCost.set(f.optionId, f.costPerPortion);
    }
    for (const p of product.packages) if (p.optionId !== null) boxCost.set(p.optionId, p.costPerBox);
  }

  const where: Prisma.OrderItemWhereInput = {
    order: {
      ...SOLD_ORDER,
      ...(from || to ? { deliveryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
  };
  const items = await prisma.orderItem.findMany({
    where,
    select: {
      productId: true,
      comboId: true,
      nameSnapshot: true,
      optionsSnapshot: true,
      unitPrice: true,
      quantity: true,
      portions: true,
      flavorOptionId: true,
      flavorMix: true,
    },
  });

  const names = new Map(data.products.map((p) => [p.id, { nameVi: p.nameVi, nameEn: p.nameEn }]));
  const groups = new Map<string, { productId: number | null; nameVi: string; nameEn: string; portions: number; revenue: number; cost: number; missing: boolean }>();
  for (const item of items) {
    const key = item.productId !== null ? `p${item.productId}` : `c${item.comboId ?? item.nameSnapshot}`;
    const name = item.productId !== null ? names.get(item.productId) : undefined;
    const group =
      groups.get(key) ??
      { productId: item.productId, nameVi: name?.nameVi ?? item.nameSnapshot, nameEn: name?.nameEn ?? item.nameSnapshot, portions: 0, revenue: 0, cost: 0, missing: false };
    groups.set(key, group);
    group.portions += item.portions;
    group.revenue += item.unitPrice * item.quantity;

    if (item.productId === null) {
      group.missing = true; // combos have no recipe
      continue;
    }
    // Portions of each flavor in this line.
    const mix = Array.isArray(item.flavorMix) ? (item.flavorMix as unknown as MixPart[]) : null;
    const parts: { cost: number | null | undefined; portions: number }[] = mix?.length
      ? mix.map((m) => ({ cost: flavorCost.get(m.optionId), portions: m.portions }))
      : item.flavorOptionId !== null
        ? [{ cost: flavorCost.get(item.flavorOptionId), portions: item.portions }]
        : [{ cost: plainCost.get(item.productId), portions: item.portions }];
    const packageId = (item.optionsSnapshot as unknown as Snapshot)?.package?.id ?? null;
    const box = packageId !== null ? boxCost.get(packageId) : 0;
    if (parts.some((p) => p.cost === null || p.cost === undefined) || box === null || box === undefined) {
      group.missing = true;
      continue;
    }
    group.cost += parts.reduce((sum, p) => sum + (p.cost as number) * p.portions, 0) + (box as number) * item.quantity;
  }

  const rows = [...groups.values()].sort((a, b) => b.revenue - a.revenue);
  const complete = rows.filter((r) => !r.missing);
  res.json({
    from: query.data.from ?? null,
    to: query.data.to ?? null,
    rows: rows.map((r) => ({ ...r, cost: r.missing ? null : r.cost, profit: r.missing ? null : r.revenue - r.cost })),
    totals: {
      revenue: rows.reduce((s, r) => s + r.revenue, 0),
      costedRevenue: complete.reduce((s, r) => s + r.revenue, 0),
      cost: complete.reduce((s, r) => s + r.cost, 0),
      profit: complete.reduce((s, r) => s + r.revenue - r.cost, 0),
    },
  });
});
