import { Router } from "express";
import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { formatDateOnly, parseDateOnly, vietnamToday } from "../lib/time";
import { eraseCustomerOnRequest, EraseError } from "../lib/privacy";
import { advanceOrder, bulkCancel, cancelOrder, findOrdersToCancel, markRefunded, OrderActionError } from "../services/order-admin-service";

export const adminOrdersRouter = Router();
adminOrdersRouter.use(requireAdmin);

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
    deliveryZone: { vi: order.deliveryZone.nameVi, en: order.deliveryZone.nameEn },
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

// GET /api/admin/orders/latest - tiny answer polled by every admin page, so staff hear
// about new orders even while they are on another tab.
adminOrdersRouter.get("/latest", async (_req, res) => {
  const [latest, waiting] = await Promise.all([
    prisma.order.findFirst({ orderBy: { id: "desc" }, select: { id: true, code: true } }),
    prisma.order.count({ where: { status: OrderStatus.PENDING } }),
  ]);
  res.json({ latestId: latest?.id ?? 0, latestCode: latest?.code ?? null, waiting });
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
adminOrdersRouter.post("/:code/erase-customer", async (req, res) => {
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
