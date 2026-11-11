import { Router } from "express";
import { CancelReason, OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import exportText from "../content/order-export.json";
import { z } from "zod";
import { requireAdminRole, requireStaff } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { formatDateOnly, parseDateOnly, vietnamToday } from "../lib/time";
import { eraseCustomerOnRequest, EraseError } from "../lib/privacy";
import { advanceOrder, bulkCancel, cancelOrder, findOrdersToCancel, markRefunded, OrderActionError } from "../services/order-admin-service";
import { contactChangesSchema, editOrderContact, OrderEditError } from "../services/order-edit-service";

export const adminOrdersRouter = Router();
// Staff and admins both handle orders; erasing customer data is for admins only.
adminOrdersRouter.use(requireStaff);

const DAY_MS = 24 * 60 * 60 * 1000;

type ItemSnapshot = { product?: { nameVi: string; nameEn: string }; flavor?: { nameVi: string; nameEn: string } | null; package?: { nameVi: string; nameEn: string } | null };

function itemNames(snapshot: Prisma.JsonValue, fallback: string) {
  const data = (typeof snapshot === "object" && snapshot !== null && !Array.isArray(snapshot) ? snapshot : {}) as ItemSnapshot;
  const parts = [data.product, data.flavor, data.package].filter((p): p is { nameVi: string; nameEn: string } => Boolean(p));
  return {
    vi: parts.length ? parts.map((p) => p.nameVi).join(" · ") : fallback,
    en: parts.length ? parts.map((p) => p.nameEn).join(" · ") : fallback,
  };
}

const orderInclude = {
  items: true,
  deliveryZone: true,
  events: { orderBy: { createdAt: "asc" }, include: { adminUser: { select: { name: true } } } },
} satisfies Prisma.OrderInclude;

type FullOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

// Full order details for staff (unlike the customer view, nothing is hidden here).
function toAdminOrder(order: FullOrder) {
  return {
    code: order.code,
    status: order.status,
    paymentStatus: order.paymentStatus,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    address: order.address,
    note: order.note,
    locale: order.locale,
    deliveryZoneId: order.deliveryZoneId,
    deliveryZone: { vi: order.deliveryZone.nameVi, en: order.deliveryZone.nameEn },
    customerEditCount: order.customerEditCount,
    customerEditedAt: order.customerEditedAt?.toISOString() ?? null, // set until staff mark the change as seen
    deliveryType: order.deliveryType,
    deliveryDate: formatDateOnly(order.deliveryDate),
    deliverySlot: order.deliverySlot,
    totalPortions: order.totalPortions,
    total: order.total,
    items: order.items.map((item) => ({
      name: itemNames(item.optionsSnapshot, item.nameSnapshot),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      portions: item.portions,
    })),
    events: order.events.map((event) => ({
      action: event.action,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      note: event.note,
      by: event.adminUser?.name ?? null,
      at: event.createdAt.toISOString(),
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    erased: order.anonymizedAt !== null,
    cancelReason: order.cancelReason,
    cancelNote: order.cancelNote,
  };
}

const listQuery = z.object({
  day: z.enum(["today", "tomorrow", "upcoming"]).default("today"),
  status: z.nativeEnum(OrderStatus).optional(),
});

// GET /api/admin/orders?day=today|tomorrow|upcoming&status=PENDING
adminOrdersRouter.get("/", async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const { day, status } = parsed.data;
  const today = vietnamToday();
  const singleDay = day === "today" ? today : day === "tomorrow" ? new Date(today.getTime() + DAY_MS) : null;
  const dateFilter: Prisma.OrderWhereInput = singleDay ? { deliveryDate: singleDay } : { deliveryDate: { gte: today } };

  const [orders, settings, capacity, statusCounts] = await Promise.all([
    prisma.order.findMany({
      where: { ...dateFilter, ...(status ? { status } : {}) },
      include: orderInclude,
      orderBy: [{ deliveryDate: "asc" }, { deliverySlot: "asc" }, { createdAt: "asc" }],
      take: 300,
    }),
    prisma.shopSetting.findUnique({ where: { id: 1 } }),
    singleDay ? prisma.dailyCapacity.findUnique({ where: { date: singleDay } }) : null,
    prisma.order.groupBy({ by: ["status"], where: dateFilter, _count: { _all: true } }),
  ]);

  const counts = Object.fromEntries(statusCounts.map((row) => [row.status, row._count._all]));
  const unpaidPending = await prisma.order.count({
    where: { ...dateFilter, status: OrderStatus.PENDING, paymentStatus: PaymentStatus.UNPAID },
  });

  res.json({
    day,
    date: singleDay ? formatDateOnly(singleDay) : null,
    summary: {
      counts,
      activeOrders: Object.entries(counts)
        .filter(([key]) => key !== OrderStatus.CANCELLED)
        .reduce((sum, [, value]) => sum + value, 0),
      bookedPortions: capacity?.bookedPortions ?? 0,
      maxPortions: capacity?.maxPortions ?? settings?.defaultDailyCapacity ?? 0,
      waitingForPayment: unpaidPending,
      unpaidCancelMinutes: settings?.unpaidCancelMinutes ?? 0,
    },
    orders: orders.map(toAdminOrder),
  });
});

const codeSchema = z.string().regex(/^[A-Z0-9]{4,12}$/);
const actionBody = z.object({
  expectedStatus: z.nativeEnum(OrderStatus),
  note: z.string().trim().max(300).optional(),
});

// Reasons staff can pick (UNPAID_TIMEOUT is only set by the automatic cancel).
const staffCancelReason = z.enum(["OUT_OF_INGREDIENTS", "CANNOT_DELIVER", "CUSTOMER_REQUEST", "SHOP_CLOSED", "OTHER"]);
const cancelBody = z.object({
  expectedStatus: z.nativeEnum(OrderStatus),
  reason: staffCancelReason,
  note: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((value) => value || null),
});
const bulkFilterBody = z.object({
  date: z.string().refine((value) => parseDateOnly(value) !== null, "Use the format YYYY-MM-DD"),
  productId: z.number().int().positive().nullable(),
});
const bulkCancelBody = bulkFilterBody.extend({
  reason: staffCancelReason,
  note: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((value) => value || null),
});

async function sendOrder(res: import("express").Response, code: string) {
  const order = await prisma.order.findUnique({ where: { code }, include: orderInclude });
  if (!order) {
    res.status(404).json({ error: "ORDER_NOT_FOUND" });
    return;
  }
  res.json(toAdminOrder(order));
}

function handleActionError(res: import("express").Response, error: unknown): void {
  if (error instanceof OrderActionError) {
    res.status(error.status).json({ error: error.code });
    return;
  }
  throw error;
}

// GET /api/admin/orders/latest - small answer polled by every admin page (every 20 seconds), so
// staff hear about new orders on any tab. Also gives the numbers for the bell and the day tabs:
// - waiting: orders still waiting for the payment check (PENDING), with the newest few listed
// - open: orders still to make or deliver (not completed or cancelled) for today, tomorrow, and from today on
adminOrdersRouter.get("/latest", async (_req, res) => {
  const today = vietnamToday();
  const tomorrow = new Date(today.getTime() + DAY_MS);
  const openStatus = { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] };
  const [latest, waiting, pending, openToday, openTomorrow, openUpcoming] = await Promise.all([
    prisma.order.findFirst({ orderBy: { id: "desc" }, select: { id: true, code: true } }),
    prisma.order.count({ where: { status: OrderStatus.PENDING } }),
    prisma.order.findMany({
      where: { status: OrderStatus.PENDING },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        code: true,
        total: true,
        totalPortions: true,
        deliveryType: true,
        deliveryDate: true,
        deliverySlot: true,
        createdAt: true,
      },
    }),
    prisma.order.count({ where: { deliveryDate: today, status: openStatus } }),
    prisma.order.count({ where: { deliveryDate: tomorrow, status: openStatus } }),
    prisma.order.count({ where: { deliveryDate: { gte: today }, status: openStatus } }),
  ]);
  res.json({
    latestId: latest?.id ?? 0,
    latestCode: latest?.code ?? null,
    waiting,
    pending: pending.map((order) => ({
      ...order,
      deliveryDate: formatDateOnly(order.deliveryDate),
      createdAt: order.createdAt.toISOString(),
    })),
    open: { today: openToday, tomorrow: openTomorrow, upcoming: openUpcoming },
  });
});

// ---------- All orders (history, search, export) ----------

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const PAGE_SIZE = 50;
const dateText = z.string().refine((value) => parseDateOnly(value) !== null, "Use the format YYYY-MM-DD");

const historyQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.nativeEnum(OrderStatus).optional(),
  payment: z.nativeEnum(PaymentStatus).optional(),
  cancelReason: z.nativeEnum(CancelReason).optional(),
  dateBy: z.enum(["created", "delivery"]).default("created"),
  from: dateText.optional(),
  to: dateText.optional(),
  productId: z.coerce.number().int().positive().optional(),
  zoneId: z.coerce.number().int().positive().optional(),
  edited: z.enum(["1"]).optional(), // only orders the customer changed and staff haven't looked at
  sort: z.enum(["new", "old", "totalDesc", "totalAsc"]).default("new"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
type HistoryQuery = z.infer<typeof historyQuery>;

function historyWhere(query: HistoryQuery): Prisma.OrderWhereInput {
  const and: Prisma.OrderWhereInput[] = [];
  if (query.q) {
    const digits = query.q.replace(/[\s.+-]/g, "");
    and.push({
      OR: [
        { code: { contains: query.q.toUpperCase() } },
        { customerName: { contains: query.q, mode: "insensitive" } },
        { address: { contains: query.q, mode: "insensitive" } },
        ...(/^\d{3,}$/.test(digits) ? [{ customerPhone: { contains: digits.replace(/^84/, "0") } }] : []),
      ],
    });
  }
  if (query.status) and.push({ status: query.status });
  if (query.payment) and.push({ paymentStatus: query.payment });
  if (query.cancelReason) and.push({ cancelReason: query.cancelReason });
  if (query.productId) and.push({ items: { some: { productId: query.productId } } });
  if (query.zoneId) and.push({ deliveryZoneId: query.zoneId });
  if (query.edited) and.push({ customerEditedAt: { not: null } });
  const from = query.from ? parseDateOnly(query.from)! : null;
  const to = query.to ? parseDateOnly(query.to)! : null;
  if (query.dateBy === "delivery") {
    if (from) and.push({ deliveryDate: { gte: from } });
    if (to) and.push({ deliveryDate: { lte: to } });
  } else {
    // Days are Vietnamese calendar days: 00:00 in Vietnam is 17:00 UTC the day before.
    if (from) and.push({ createdAt: { gte: new Date(from.getTime() - VIETNAM_OFFSET_MS) } });
    if (to) and.push({ createdAt: { lt: new Date(to.getTime() + DAY_MS - VIETNAM_OFFSET_MS) } });
  }
  return and.length ? { AND: and } : {};
}

function historyOrderBy(sort: HistoryQuery["sort"]): Prisma.OrderOrderByWithRelationInput[] {
  if (sort === "old") return [{ createdAt: "asc" }];
  if (sort === "totalDesc") return [{ total: "desc" }, { createdAt: "desc" }];
  if (sort === "totalAsc") return [{ total: "asc" }, { createdAt: "desc" }];
  return [{ createdAt: "desc" }];
}

// GET /api/admin/orders/history?q=&status=&payment=&cancelReason=&dateBy=created|delivery&from=&to=&productId=&zoneId=&edited=1&sort=&page=
adminOrdersRouter.get("/history", async (req, res) => {
  const parsed = historyQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const query = parsed.data;
  const where = historyWhere(query);
  const [orders, count, money, products, zones] = await Promise.all([
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: historyOrderBy(query.sort),
      skip: (query.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.order.count({ where }),
    // Money of the matching orders, cancelled ones left out.
    prisma.order.aggregate({ where: { AND: [where, { status: { not: OrderStatus.CANCELLED } }] }, _sum: { total: true } }),
    prisma.product.findMany({ orderBy: { nameVi: "asc" }, select: { id: true, nameVi: true, nameEn: true } }),
    prisma.deliveryZone.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, nameVi: true, nameEn: true, isActive: true } }),
  ]);
  res.json({
    orders: orders.map(toAdminOrder),
    count,
    revenue: money._sum.total ?? 0,
    page: query.page,
    pageSize: PAGE_SIZE,
    products,
    zones,
  });
});

const EXPORT_LIMIT = 5000;

// One CSV cell. Text that starts like a formula gets a leading quote so Excel shows it as text.
function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

// GET /api/admin/orders/export?(same filters as /history) - a CSV file Excel opens (up to 5000 orders)
adminOrdersRouter.get("/export", async (req, res) => {
  const parsed = historyQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const orders = await prisma.order.findMany({
    where: historyWhere(parsed.data),
    include: { items: true, deliveryZone: true },
    orderBy: historyOrderBy(parsed.data.sort),
    take: EXPORT_LIMIT,
  });
  const placedAt = (date: Date) => new Date(date.getTime() + VIETNAM_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
  const rows = orders.map((order) =>
    [
      csvCell(order.code),
      csvCell(placedAt(order.createdAt)),
      csvCell(formatDateOnly(order.deliveryDate)),
      csvCell(order.deliveryType === "ASAP" ? exportText.asap : order.deliverySlot),
      csvCell(exportText.status[order.status]),
      csvCell(exportText.payment[order.paymentStatus]),
      csvCell(order.customerName),
      // ="0912..." keeps the leading zero in Excel; only digits ever go in here.
      order.customerPhone ? `"=""${order.customerPhone.replace(/\D/g, "")}"""` : csvCell(""),
      csvCell(order.address),
      csvCell(order.deliveryZone.nameVi),
      csvCell(order.items.map((item) => `${item.quantity} × ${itemNames(item.optionsSnapshot, item.nameSnapshot).vi}`).join("; ")),
      csvCell(order.totalPortions),
      csvCell(order.total),
      csvCell(order.note),
      csvCell(order.cancelReason ? exportText.cancelReasons[order.cancelReason] : ""),
    ].join(","),
  );
  const csv = "\uFEFF" + [exportText.columns.map(csvCell).join(","), ...rows].join("\r\n"); // BOM: Excel reads it as UTF-8
  const day = formatDateOnly(vietnamToday());
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="chuvachi-orders-${day}.csv"`);
  res.setHeader("Cache-Control", "no-store");
  console.log(`Orders exported (${orders.length}) by admin ${req.admin!.email}`);
  res.send(csv);
});

// GET /api/admin/orders/:code
adminOrdersRouter.get("/:code", async (req, res) => {
  const code = codeSchema.safeParse(req.params.code.toUpperCase());
  if (!code.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  await sendOrder(res, code.data);
});

// POST /api/admin/orders/:code/advance  { expectedStatus }
adminOrdersRouter.post("/:code/advance", async (req, res) => {
  const code = codeSchema.safeParse(req.params.code.toUpperCase());
  const body = actionBody.safeParse(req.body);
  if (!code.success || !body.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  try {
    await advanceOrder(code.data, body.data.expectedStatus, req.admin!.id);
  } catch (error) {
    handleActionError(res, error);
    return;
  }
  await sendOrder(res, code.data);
});

// POST /api/admin/orders/:code/cancel  { expectedStatus, reason, note? }
// The reason and note are shown to the customer on the order lookup page.
adminOrdersRouter.post("/:code/cancel", async (req, res) => {
  const code = codeSchema.safeParse(String(req.params.code).toUpperCase());
  const body = cancelBody.safeParse(req.body);
  if (!code.success || !body.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  try {
    await cancelOrder(code.data, body.data.expectedStatus, req.admin!.id, {
      reason: body.data.reason,
      note: body.data.note,
    });
  } catch (error) {
    handleActionError(res, error);
    return;
  }
  await sendOrder(res, code.data);
});

// POST /api/admin/orders/:code/refund
adminOrdersRouter.post("/:code/refund", async (req, res) => {
  const code = codeSchema.safeParse(req.params.code.toUpperCase());
  if (!code.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  try {
    await markRefunded(code.data, req.admin!.id);
  } catch (error) {
    handleActionError(res, error);
    return;
  }
  await sendOrder(res, code.data);
});

// POST /api/admin/orders/:code/erase-customer
// The customer asked us to delete their data: erases name, phone and address from all of their
// finished orders. Refused while one of their orders is still running.
adminOrdersRouter.post("/:code/erase-customer", requireAdminRole, async (req, res) => {
  const code = codeSchema.safeParse(String(req.params.code).toUpperCase());
  if (!code.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  try {
    const count = await eraseCustomerOnRequest(code.data, req.admin!.id);
    console.log(`Customer data erased from ${count} order(s) on request, by admin ${req.admin!.email}`);
  } catch (error) {
    if (error instanceof EraseError) {
      res.status(error.code === "ORDER_NOT_FOUND" ? 404 : 409).json({ error: error.code });
      return;
    }
    throw error;
  }
  await sendOrder(res, code.data);
});

// POST /api/admin/orders/:code/contact  { customerName?, customerPhone?, address?, deliveryZoneId?, note? }
// Staff change the contact details (e.g. the customer asked on Facebook). Allowed at any status.
adminOrdersRouter.post("/:code/contact", async (req, res) => {
  const code = codeSchema.safeParse(String(req.params.code).toUpperCase());
  const body = contactChangesSchema.safeParse(req.body);
  if (!code.success || !body.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  try {
    await editOrderContact(code.data, body.data, { kind: "staff", adminUserId: req.admin!.id });
  } catch (error) {
    if (error instanceof OrderEditError) {
      res.status(error.status).json({ error: error.code });
      return;
    }
    throw error;
  }
  await sendOrder(res, code.data);
});

// POST /api/admin/orders/:code/edit-seen - staff saw the customer's change; removes the "changed" label
adminOrdersRouter.post("/:code/edit-seen", async (req, res) => {
  const code = codeSchema.safeParse(String(req.params.code).toUpperCase());
  if (!code.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  await prisma.order.updateMany({ where: { code: code.data }, data: { customerEditedAt: null } });
  await sendOrder(res, code.data);
});

// ---------- Cancel many orders at once ----------

const toRefundRow = (order: Awaited<ReturnType<typeof findOrdersToCancel>>[number]) => ({
  code: order.code,
  status: order.status,
  paid: order.paymentStatus === "PAID",
  total: order.total,
  customerName: order.customerName,
  customerPhone: order.customerPhone,
});

// POST /api/admin/orders/bulk-cancel/preview  { date, productId }
// Lists the open orders that would be cancelled, without changing anything.
adminOrdersRouter.post("/bulk-cancel/preview", async (req, res) => {
  const body = bulkFilterBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const orders = await findOrdersToCancel({ date: parseDateOnly(body.data.date)!, productId: body.data.productId });
  res.json({ orders: orders.map(toRefundRow) });
});

// POST /api/admin/orders/bulk-cancel  { date, productId, reason, note? }
adminOrdersRouter.post("/bulk-cancel", async (req, res) => {
  const body = bulkCancelBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const cancelled = await bulkCancel(
    { date: parseDateOnly(body.data.date)!, productId: body.data.productId },
    req.admin!.id,
    { reason: body.data.reason, note: body.data.note },
  );
  console.log(`Bulk cancel of ${cancelled.length} order(s) for ${body.data.date} by admin ${req.admin!.email}`);
  res.json({ cancelled: cancelled.map(toRefundRow) });
});
