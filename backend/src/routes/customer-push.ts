import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { rateLimitKey } from "../lib/client-ip";
import { currentCustomerId, requireCustomer } from "../lib/customer-auth";
import { parseLocale } from "../lib/locale";
import { normalizePhone } from "../lib/phone";
import { prisma } from "../lib/prisma";
import { isAllowedPushEndpoint, pushPublicKey } from "../lib/push";
import { renderNotice, sendWelcome } from "../services/customer-push";

// Customers switch push notifications on for the browser they use. Signed in: news about all
// their orders and replies to their reviews. Guests: they follow one order (code + phone).
export const customerPushRouter = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  message: { error: "TOO_MANY_REQUESTS" },
});

const endpointSchema = z.string().url().max(1000);
const subscribeSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
  locale: z.string().optional(),
});

// GET /api/push/public-key - the key browsers need to subscribe (null when push isn't set up)
customerPushRouter.get("/push/public-key", (_req, res) => {
  res.json({ publicKey: pushPublicKey() });
});

// POST /api/push/subscribe  { endpoint, keys, locale } - remember this browser
customerPushRouter.post("/push/subscribe", limiter, async (req, res) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success || !isAllowedPushEndpoint(parsed.data.endpoint)) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const { endpoint, keys } = parsed.data;
  const locale = parseLocale(parsed.data.locale);
  const customerId = await currentCustomerId(req);
  const existing = await prisma.customerPushSubscription.findUnique({ where: { endpoint } });
  const subscription = await prisma.customerPushSubscription.upsert({
    where: { endpoint },
    // Signing in on this browser links it to that account; signing out keeps the old link.
    update: { p256dh: keys.p256dh, auth: keys.auth, locale, ...(customerId ? { customerId } : {}) },
    create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, locale, customerId },
  });
  if (!existing) void sendWelcome(subscription.id).catch(() => undefined);
  res.json({ ok: true, account: subscription.customerId !== null });
});

// POST /api/push/unsubscribe  { endpoint } - forget this browser (and the orders it followed)
customerPushRouter.post("/push/unsubscribe", limiter, async (req, res) => {
  const parsed = z.object({ endpoint: endpointSchema }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  await prisma.customerPushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint } });
  res.json({ ok: true });
});

const orderSchema = z.object({
  endpoint: endpointSchema,
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,12}$/),
  phone: z.string().trim().min(8).max(20).optional(),
});

// POST /api/push/watch-order  { endpoint, code, phone? } - this browser follows one order.
// Needs the order's phone number, or being signed in to the account that owns it.
customerPushRouter.post("/push/watch-order", limiter, async (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const { endpoint, code, phone } = parsed.data;
  const [subscription, order, customerId] = await Promise.all([
    prisma.customerPushSubscription.findUnique({ where: { endpoint } }),
    prisma.order.findUnique({ where: { code }, select: { id: true, customerId: true, customerPhone: true } }),
    currentCustomerId(req),
  ]);
  const owner = order !== null && customerId !== null && order.customerId === customerId;
  const phoneMatches = order !== null && phone !== undefined && order.customerPhone === normalizePhone(phone);
  if (!subscription || !order || (!owner && !phoneMatches)) {
    res.status(404).json({ error: "ORDER_NOT_FOUND" });
    return;
  }
  await prisma.orderPushWatch.upsert({
    where: { subscriptionId_orderId: { subscriptionId: subscription.id, orderId: order.id } },
    update: {},
    create: { subscriptionId: subscription.id, orderId: order.id },
  });
  res.json({ ok: true });
});

// POST /api/push/status  { endpoint, code? } - is this browser known, linked to an account,
// and following this order? (POST so the endpoint never ends up in a URL or a log line.)
customerPushRouter.post("/push/status", limiter, async (req, res) => {
  const parsed = z.object({ endpoint: endpointSchema, code: z.string().max(12).optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const subscription = await prisma.customerPushSubscription.findUnique({ where: { endpoint: parsed.data.endpoint } });
  let watching = false;
  if (subscription && parsed.data.code) {
    const order = await prisma.order.findUnique({
      where: { code: parsed.data.code.toUpperCase() },
      select: { id: true, customerId: true },
    });
    if (order) {
      // Followed directly, or it belongs to the account this browser is linked to.
      const watch = await prisma.orderPushWatch.findUnique({
        where: { subscriptionId_orderId: { subscriptionId: subscription.id, orderId: order.id } },
      });
      watching = watch !== null || (subscription.customerId !== null && subscription.customerId === order.customerId);
    }
  }
  res.json({ subscribed: subscription !== null, account: subscription?.customerId != null, watching });
});

// ---------- Bell list (signed-in customers) ----------

const BELL_LIST_SIZE = 30;

// GET /api/account/notifications?locale=vi - newest notifications and how many are unread
customerPushRouter.get("/account/notifications", requireCustomer, async (req, res) => {
  const locale = parseLocale(req.query.locale);
  const customerId = req.customerId!;
  const [rows, unread] = await Promise.all([
    prisma.customerNotification.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: BELL_LIST_SIZE,
    }),
    prisma.customerNotification.count({ where: { customerId, readAt: null } }),
  ]);
  res.json({
    unread,
    items: rows.map((row) => {
      const values = (typeof row.values === "object" && row.values !== null && !Array.isArray(row.values)
        ? row.values
        : {}) as Record<string, string | null>;
      return {
        id: row.id,
        ...renderNotice(locale, row.kind, values),
        url: `/${locale}${row.path}`,
        read: row.readAt !== null,
        createdAt: row.createdAt.toISOString(),
      };
    }),
  });
});

// GET /api/account/notifications/unread - just the number, for the dot on the bell
customerPushRouter.get("/account/notifications/unread", requireCustomer, async (req, res) => {
  res.json({ unread: await prisma.customerNotification.count({ where: { customerId: req.customerId!, readAt: null } }) });
});

// POST /api/account/notifications/read - mark everything as read (the list was opened)
customerPushRouter.post("/account/notifications/read", requireCustomer, async (req, res) => {
  await prisma.customerNotification.updateMany({
    where: { customerId: req.customerId!, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
});
