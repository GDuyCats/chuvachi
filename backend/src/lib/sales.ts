import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { formatDateOnly } from "./time";

// A sale is an order the shop confirmed as paid and did not cancel afterwards.
// Cancelled orders (refunded or not) and unpaid orders never count.
export const SOLD_ORDER = {
  paymentStatus: "PAID",
  status: { not: "CANCELLED" },
} satisfies Prisma.OrderWhereInput;

// Portions sold of each product since the shop opened.
export async function soldPortionsByProduct(productIds: number[]): Promise<Map<number, number>> {
  if (productIds.length === 0) return new Map();
  const rows = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds }, order: SOLD_ORDER },
    _sum: { portions: true },
  });
  return new Map(rows.filter((row) => row.productId !== null).map((row) => [row.productId as number, row._sum.portions ?? 0]));
}

type ProductRow = { productId: number | null; snapshot: string | null; portions: number; orders: number; revenue: bigint };
type TotalRow = { orders: number; portions: number; revenue: bigint | null };
type PeriodRow = { period: Date; orders: number; portions: number; revenue: bigint };

// Sales between two delivery days (both included); no dates means since the shop opened.
// Grouped by day for short ranges, by month for long ones.
export async function salesReport(from: Date | null, to: Date | null) {
  const range = Prisma.sql`
    o."paymentStatus" = 'PAID' AND o."status" <> 'CANCELLED'
    ${from ? Prisma.sql`AND o."deliveryDate" >= ${from}` : Prisma.empty}
    ${to ? Prisma.sql`AND o."deliveryDate" <= ${to}` : Prisma.empty}`;

  const [totals] = await prisma.$queryRaw<TotalRow[]>`
    SELECT COUNT(*)::int AS "orders",
           COALESCE(SUM(o."totalPortions"), 0)::int AS "portions",
           SUM(o."total")::bigint AS "revenue"
    FROM "Order" o
    WHERE ${range}`;

  // One row per product. Lines without a product (e.g. combos) are grouped by their saved name.
  const productRows = await prisma.$queryRaw<ProductRow[]>`
    SELECT i."productId" AS "productId",
           CASE WHEN i."productId" IS NULL THEN i."nameSnapshot" END AS "snapshot",
           SUM(i."portions")::int AS "portions",
           COUNT(DISTINCT i."orderId")::int AS "orders",
           SUM(i."unitPrice" * i."quantity")::bigint AS "revenue"
    FROM "OrderItem" i
    JOIN "Order" o ON o."id" = i."orderId"
    WHERE ${range}
    GROUP BY 1, 2
    ORDER BY 3 DESC`;

  // Find the span actually covered, to choose days or months.
  const first = from ?? (await prisma.order.findFirst({ where: SOLD_ORDER, orderBy: { deliveryDate: "asc" } }))?.deliveryDate;
  const last = to ?? (await prisma.order.findFirst({ where: SOLD_ORDER, orderBy: { deliveryDate: "desc" } }))?.deliveryDate;
  const spanDays = first && last ? Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1 : 0;
  const unit = spanDays > 62 ? "month" : "day";

  const periodRows = await prisma.$queryRaw<PeriodRow[]>`
    SELECT date_trunc(${unit}, o."deliveryDate")::date AS "period",
           COUNT(*)::int AS "orders",
           SUM(o."totalPortions")::int AS "portions",
           SUM(o."total")::bigint AS "revenue"
    FROM "Order" o
    WHERE ${range}
    GROUP BY 1
    ORDER BY 1`;

  const ids = productRows.map((row) => row.productId).filter((id): id is number => id !== null);
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true, nameVi: true, nameEn: true, imageUrl: true },
  });
  const byId = new Map(products.map((product) => [product.id, product]));

  return {
    from: from ? formatDateOnly(from) : null,
    to: to ? formatDateOnly(to) : null,
    unit,
    totals: { orders: totals.orders, portions: totals.portions, revenue: Number(totals.revenue ?? 0) },
    products: productRows.map((row) => {
      const product = row.productId !== null ? byId.get(row.productId) : undefined;
      return {
        productId: row.productId,
        slug: product?.slug ?? null,
        nameVi: product?.nameVi ?? row.snapshot ?? "?",
        nameEn: product?.nameEn ?? row.snapshot ?? "?",
        imageUrl: product?.imageUrl ?? null,
        portions: row.portions,
        orders: row.orders,
        revenue: Number(row.revenue),
      };
    }),
    periods: periodRows.map((row) => ({
      start: formatDateOnly(row.period),
      orders: row.orders,
      portions: row.portions,
      revenue: Number(row.revenue),
    })),
  };
}
