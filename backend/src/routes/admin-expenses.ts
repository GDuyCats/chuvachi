import { ExpenseCategory, Prisma } from "@prisma/client";
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import exportText from "../content/expense-export.json";
import { requireAdminRole, requireStaff } from "../lib/auth";
import { rateLimitKey } from "../lib/client-ip";
import { ImageError, receiveSingleImage, storeImage } from "../lib/image-upload";
import { prisma } from "../lib/prisma";
import { SOLD_ORDER } from "../lib/sales";
import { deleteImageByUrl, isOwnImageInFolder, isStorageConfigured } from "../lib/storage";
import { formatDateOnly, parseDateOnly } from "../lib/time";

// The shop's costs (shopping trips, boxes, monthly bills) with receipt photos, and profit / loss.
// Staff may record purchases; only admins see profit and loss or change other people's entries.
export const adminExpensesRouter = Router();
adminExpensesRouter.use(requireStaff);

const FOLDER = "receipts";
const MAX_PHOTOS = 6;
const PAGE_SIZE = 50;

const dateText = z.string().refine((value) => parseDateOnly(value) !== null, "Use the format YYYY-MM-DD");

const expenseSchema = z.object({
  spentOn: dateText,
  title: z.string().trim().min(1).max(120),
  amount: z.number().int().min(1).max(1_000_000_000),
  category: z.nativeEnum(ExpenseCategory),
  note: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .transform((value) => value || null),
  photos: z
    .array(z.string().url().max(500))
    .max(MAX_PHOTOS)
    .refine((urls) => urls.every((url) => isOwnImageInFolder(url, FOLDER)), "Photos must be uploaded here first"),
});

const rangeQuery = z.object({
  from: dateText.optional(),
  to: dateText.optional(),
  category: z.nativeEnum(ExpenseCategory).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

function badRequest(res: Response): void {
  res.status(400).json({ error: "VALIDATION_ERROR" });
}

function rangeWhere(from?: string, to?: string, category?: ExpenseCategory): Prisma.ExpenseWhereInput {
  const spentOn: Prisma.DateTimeFilter = {};
  if (from) spentOn.gte = parseDateOnly(from)!;
  if (to) spentOn.lte = parseDateOnly(to)!;
  return { ...(from || to ? { spentOn } : {}), ...(category ? { category } : {}) };
}

type ExpenseRow = Prisma.ExpenseGetPayload<{ include: { createdBy: { select: { name: true } } } }>;

function toJson(row: ExpenseRow, req: Request) {
  return {
    id: row.id,
    spentOn: formatDateOnly(row.spentOn),
    title: row.title,
    amount: row.amount,
    category: row.category,
    note: row.note,
    photos: row.photos,
    createdBy: row.createdBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    // Staff can change only what they entered; admins can change everything.
    canEdit: req.admin!.role === "ADMIN" || row.createdById === req.admin!.id,
  };
}

// Admins change any entry; staff only their own.
async function findEditable(req: Request, res: Response) {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) {
    badRequest(res);
    return null;
  }
  const row = await prisma.expense.findUnique({ where: { id: id.data } });
  if (!row) {
    res.status(404).json({ error: "NOT_FOUND" });
    return null;
  }
  if (req.admin!.role !== "ADMIN" && row.createdById !== req.admin!.id) {
    res.status(403).json({ error: "FORBIDDEN" });
    return null;
  }
  return row;
}

async function removePhotos(urls: string[]): Promise<void> {
  for (const url of urls) {
    if (!isOwnImageInFolder(url, FOLDER)) continue;
    await deleteImageByUrl(url).catch((error: unknown) => console.error("Receipt photo delete failed:", error));
  }
}

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  message: { error: "TOO_MANY_REQUESTS" },
});

// POST /api/admin/expenses/photo  (multipart, field "image") -> { url }
// The photo is only kept with an entry after Save; kept large enough to read the receipt.
adminExpensesRouter.post("/photo", uploadLimiter, receiveSingleImage, async (req, res) => {
  if (!isStorageConfigured()) {
    res.status(503).json({ error: "STORAGE_NOT_CONFIGURED" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "NO_FILE" });
    return;
  }
  try {
    res.status(201).json({ url: await storeImage(req.file.buffer, FOLDER, 2000) });
  } catch (error) {
    if (error instanceof ImageError) {
      res.status(400).json({ error: "UNSUPPORTED_IMAGE" });
      return;
    }
    throw error;
  }
});

// GET /api/admin/expenses?from=&to=&category=&page=
adminExpensesRouter.get("/", async (req, res) => {
  const query = rangeQuery.safeParse(req.query);
  if (!query.success) return badRequest(res);
  const where = rangeWhere(query.data.from, query.data.to, query.data.category);
  const [rows, count, sum] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: { createdBy: { select: { name: true } } },
      orderBy: [{ spentOn: "desc" }, { id: "desc" }],
      skip: (query.data.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({ where, _sum: { amount: true } }),
  ]);
  res.json({
    expenses: rows.map((row) => toJson(row, req)),
    count,
    total: sum._sum.amount ?? 0,
    page: query.data.page,
    pageSize: PAGE_SIZE,
  });
});

// POST /api/admin/expenses
adminExpensesRouter.post("/", async (req, res) => {
  const body = expenseSchema.safeParse(req.body);
  if (!body.success) return badRequest(res);
  const row = await prisma.expense.create({
    data: { ...body.data, spentOn: parseDateOnly(body.data.spentOn)!, createdById: req.admin!.id },
    include: { createdBy: { select: { name: true } } },
  });
  res.status(201).json(toJson(row, req));
});

// PUT /api/admin/expenses/:id
adminExpensesRouter.put("/:id", async (req, res) => {
  const body = expenseSchema.safeParse(req.body);
  if (!body.success) return badRequest(res);
  const before = await findEditable(req, res);
  if (!before) return;
  const row = await prisma.expense.update({
    where: { id: before.id },
    data: { ...body.data, spentOn: parseDateOnly(body.data.spentOn)! },
    include: { createdBy: { select: { name: true } } },
  });
  await removePhotos(before.photos.filter((url) => !row.photos.includes(url)));
  res.json(toJson(row, req));
});

// DELETE /api/admin/expenses/:id
adminExpensesRouter.delete("/:id", async (req, res) => {
  const before = await findEditable(req, res);
  if (!before) return;
  await prisma.expense.delete({ where: { id: before.id } });
  await removePhotos(before.photos);
  res.json({ ok: true });
});

// ---------- Profit and loss (admins only) ----------

type PeriodRow = { period: Date; amount: bigint };

// GET /api/admin/expenses/summary?from=&to=
// Sales (paid, not cancelled, by delivery day) minus costs (by purchase day), per day or per month.
adminExpensesRouter.get("/summary", requireAdminRole, async (req, res) => {
  const query = rangeQuery.safeParse(req.query);
  if (!query.success) return badRequest(res);
  const from = query.data.from ? parseDateOnly(query.data.from)! : null;
  const to = query.data.to ? parseDateOnly(query.data.to)! : null;
  if (from && to && from > to) return badRequest(res);

  const salesDays: Prisma.OrderWhereInput = {
    ...SOLD_ORDER,
    ...(from || to ? { deliveryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };
  const costDays = rangeWhere(query.data.from, query.data.to);

  // Days for a short range, months for a long one (same rule as the sales page).
  const [firstSale, firstCost, lastSale, lastCost] = await Promise.all([
    from ? null : prisma.order.findFirst({ where: SOLD_ORDER, orderBy: { deliveryDate: "asc" }, select: { deliveryDate: true } }),
    from ? null : prisma.expense.findFirst({ orderBy: { spentOn: "asc" }, select: { spentOn: true } }),
    to ? null : prisma.order.findFirst({ where: SOLD_ORDER, orderBy: { deliveryDate: "desc" }, select: { deliveryDate: true } }),
    to ? null : prisma.expense.findFirst({ orderBy: { spentOn: "desc" }, select: { spentOn: true } }),
  ]);
  const earliest = [from, firstSale?.deliveryDate, firstCost?.spentOn].filter((d): d is Date => Boolean(d));
  const latest = [to, lastSale?.deliveryDate, lastCost?.spentOn].filter((d): d is Date => Boolean(d));
  const start = earliest.length ? new Date(Math.min(...earliest.map((d) => d.getTime()))) : null;
  const end = latest.length ? new Date(Math.max(...latest.map((d) => d.getTime()))) : null;
  const spanDays = start && end ? Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1 : 0;
  const unit = spanDays > 62 ? "month" : "day";

  const saleRange = Prisma.sql`o."paymentStatus" = 'PAID' AND o."status" <> 'CANCELLED'
    ${from ? Prisma.sql`AND o."deliveryDate" >= ${from}` : Prisma.empty}
    ${to ? Prisma.sql`AND o."deliveryDate" <= ${to}` : Prisma.empty}`;
  const costRange = Prisma.sql`TRUE
    ${from ? Prisma.sql`AND e."spentOn" >= ${from}` : Prisma.empty}
    ${to ? Prisma.sql`AND e."spentOn" <= ${to}` : Prisma.empty}`;

  const [sales, costs, byCategory, salePeriods, costPeriods] = await Promise.all([
    prisma.order.aggregate({ where: salesDays, _sum: { total: true }, _count: true }),
    prisma.expense.aggregate({ where: costDays, _sum: { amount: true }, _count: true }),
    prisma.expense.groupBy({ by: ["category"], where: costDays, _sum: { amount: true } }),
    prisma.$queryRaw<PeriodRow[]>`
      SELECT date_trunc(${unit}, o."deliveryDate")::date AS "period", SUM(o."total")::bigint AS "amount"
      FROM "Order" o WHERE ${saleRange} GROUP BY 1`,
    prisma.$queryRaw<PeriodRow[]>`
      SELECT date_trunc(${unit}, e."spentOn")::date AS "period", SUM(e."amount")::bigint AS "amount"
      FROM "Expense" e WHERE ${costRange} GROUP BY 1`,
  ]);

  const periods = new Map<string, { start: string; revenue: number; costs: number }>();
  const slot = (date: Date) => {
    const key = formatDateOnly(date);
    if (!periods.has(key)) periods.set(key, { start: key, revenue: 0, costs: 0 });
    return periods.get(key)!;
  };
  for (const row of salePeriods) slot(row.period).revenue = Number(row.amount);
  for (const row of costPeriods) slot(row.period).costs = Number(row.amount);

  const revenue = sales._sum.total ?? 0;
  const totalCosts = costs._sum.amount ?? 0;
  res.json({
    from: query.data.from ?? null,
    to: query.data.to ?? null,
    unit,
    revenue,
    orders: sales._count,
    costs: totalCosts,
    expenses: costs._count,
    profit: revenue - totalCosts,
    byCategory: Object.values(ExpenseCategory).map((category) => ({
      category,
      amount: byCategory.find((row) => row.category === category)?._sum.amount ?? 0,
    })),
    periods: [...periods.values()]
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((p) => ({ ...p, profit: p.revenue - p.costs })),
  });
});

function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

// GET /api/admin/expenses/export?from=&to=&category= - CSV for Excel (admins only)
adminExpensesRouter.get("/export", requireAdminRole, async (req, res) => {
  const query = rangeQuery.safeParse(req.query);
  if (!query.success) return badRequest(res);
  const rows = await prisma.expense.findMany({
    where: rangeWhere(query.data.from, query.data.to, query.data.category),
    include: { createdBy: { select: { name: true } } },
    orderBy: [{ spentOn: "asc" }, { id: "asc" }],
    take: 10_000,
  });
  const lines = rows.map((row) =>
    [
      csvCell(formatDateOnly(row.spentOn)),
      csvCell(row.title),
      csvCell(exportText.categories[row.category]),
      csvCell(row.amount),
      csvCell(row.note),
      csvCell(row.photos.length),
      csvCell(row.createdBy?.name ?? ""),
    ].join(","),
  );
  const csv = "﻿" + [exportText.columns.map(csvCell).join(","), ...lines].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="chuvachi-expenses.csv"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(csv);
});
