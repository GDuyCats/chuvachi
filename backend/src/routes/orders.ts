import { Router } from "express";
import { DeliveryType } from "@prisma/client";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { parseLocale, pickText } from "../lib/locale";
import { formatDateOnly, vietnamTimeOn, vietnamToday } from "../lib/time";
import { normalizePhone, PHONE_PATTERN } from "../lib/phone";
import { prisma } from "../lib/prisma";
import { createOrder, findOrderForCustomer, OrderError } from "../services/order-service";
import { currentCustomerId } from "../lib/customer-auth";
import { notifyNewOrder } from "../services/notifications";
import { rateLimitKey } from "../lib/client-ip";
import { requireHuman } from "../lib/turnstile";
import { contactChangesSchema, editOrderContact, OrderEditError } from "../services/order-edit-service";

export const ordersRouter = Router();

// ---------- Abuse protection ----------

// Placing orders: a real customer rarely needs more than a few per hour.
const placeOrderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: rateLimitKey, // real visitor IP behind Cloudflare
  message: { error: "TOO_MANY_REQUESTS", message: "Too many orders from this device. Please try again later." },
});

// Looking up orders: limits guessing order codes and phone numbers.
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: rateLimitKey, // real visitor IP behind Cloudflare
  message: { error: "TOO_MANY_REQUESTS", message: "Too many lookups. Please try again later." },
});

// ---------- Validation ----------

const phoneSchema = z
  .string()
  .trim()
  .refine((value) => PHONE_PATTERN.test(normalizePhone(value)), "Invalid phone number");

const optionIdSchema = z.number().int().positive().nullable().optional();

const orderItemSchema = z.object({
  productSlug: z.string().regex(/^[a-z0-9-]{1,80}$/, "Invalid product"),
  flavorOptionId: optionIdSchema,
  packageOptionId: optionIdSchema,
  // A box shared between flavors, e.g. box of 6 = 2 mango + 2 strawberry + 2 blueberry (portions per box).
  flavorMix: z
    .array(z.object({ optionId: z.number().int().positive(), portions: z.number().int().min(1).max(100) }))
    .min(1)
    .max(20)
    .optional(),
  quantity: z.number().int().min(1).max(200), // the shop's own limit is checked when the order is created
  note: z.string().trim().max(200).optional(),
});

const createOrderSchema = z
  .object({
    customerName: z.string().trim().min(1).max(100),
    customerPhone: phoneSchema,
    address: z.string().trim().min(5).max(300),
    note: z.string().trim().max(500).optional(),
    deliveryZoneId: z.number().int().positive(),
    deliveryType: z.nativeEnum(DeliveryType),
    deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD").optional(),
    deliverySlot: z.string().min(1).max(20).optional(),
    locale: z.enum(["vi", "en"]).default("vi"),
    items: z.array(orderItemSchema).min(1).max(30),
    // The customer must tick the box themselves; the law doesn't accept silence or pre-ticked boxes.
    privacyConsent: z.literal(true, { errorMap: () => ({ message: "Please agree to the privacy policy" }) }),
  })
  .refine(
    (order) => order.deliveryType === DeliveryType.ASAP || (order.deliveryDate && order.deliverySlot),
    { message: "A scheduled delivery needs a date and a time slot", path: ["deliveryDate"] },
  );

// ---------- Routes ----------

// POST /api/orders - place a new order
ordersRouter.post("/orders", placeOrderLimiter, requireHuman, async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Some order fields are invalid",
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const customerId = await currentCustomerId(req); // null for guests
    const order = await createOrder({ ...parsed.data, customerId });
    res.status(201).json(order);
    // Tell staff on Telegram (after answering the customer, so a slow Telegram never delays them).
    void notifyNewOrder(order.code).catch((error: unknown) => console.error("New order notification failed:", error));
  } catch (error) {
    if (error instanceof OrderError) {
      res.status(error.status).json({ error: error.code, message: error.message, product: error.product });
      return;
    }
    throw error;
  }
});

// GET /api/orders/:code?phone=0912345678&locale=vi - customer looks up their order
ordersRouter.get("/orders/:code", lookupLimiter, requireHuman, async (req, res) => {
  const phone = typeof req.query.phone === "string" ? req.query.phone : "";
  const code = String(req.params.code);
  if (!phone || !/^[A-Za-z0-9]{4,12}$/.test(code)) {
    res.status(400).json({ error: "INVALID_LOOKUP", message: "Order code and phone number are required" });
    return;
  }

  const order = await findOrderForCustomer(code, phone, parseLocale(req.query.locale));
  if (!order) {
    // Same answer whether the code or the phone is wrong, so nothing can be guessed from it.
    res.status(404).json({ error: "ORDER_NOT_FOUND", message: "Order not found" });
    return;
  }

  res.json(order);
});

// Changing an order's contact details: a few times per order at most, so a low limit is enough.
const editLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  message: { error: "TOO_MANY_REQUESTS" },
});

const guestEditSchema = z.object({
  phone: z.string().trim().min(1).max(20), // the phone the order was looked up with
  locale: z.enum(["vi", "en"]).default("vi"),
  changes: contactChangesSchema,
});

// POST /api/orders/:code/contact  { phone, locale, changes: { customerName?, customerPhone?, address?, deliveryZoneId?, note? } }
// A guest fixes the contact details of their order (code + phone, like the lookup). Returns the order again
// and the phone to use from now on.
ordersRouter.post("/orders/:code/contact", editLimiter, requireHuman, async (req, res) => {
  const code = String(req.params.code);
  const parsed = guestEditSchema.safeParse(req.body);
  if (!parsed.success || !/^[A-Za-z0-9]{4,12}$/.test(code)) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      details: parsed.success ? [] : parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    });
    return;
  }
  const { phone, locale, changes } = parsed.data;
  if (!(await findOrderForCustomer(code, phone, locale))) {
    res.status(404).json({ error: "ORDER_NOT_FOUND" });
    return;
  }
  try {
    const result = await editOrderContact(code, changes, { kind: "customer" });
    res.json({ order: await findOrderForCustomer(code, result.phone, locale), phone: result.phone });
  } catch (error) {
    if (error instanceof OrderEditError) {
      res.status(error.status).json({ error: error.code });
      return;
    }
    throw error;
  }
});

// GET /api/order-settings?locale=vi - everything the checkout page needs
ordersRouter.get("/order-settings", async (req, res) => {
  const locale = parseLocale(req.query.locale);
  const [settings, zones] = await Promise.all([
    prisma.shopSetting.findUnique({ where: { id: 1 } }),
    prisma.deliveryZone.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  if (!settings) {
    res.status(500).json({ error: "SHOP_NOT_CONFIGURED", message: "Shop settings are missing" });
    return;
  }

  // Whether a small "as soon as possible" order can still be ready before closing today.
  const today = vietnamToday();
  const now = Date.now();
  const openAt = vietnamTimeOn(today, settings.openTime).getTime();
  const closeAt = vietnamTimeOn(today, settings.closeTime).getTime();
  const asapAvailable =
    !settings.closedWeekdays.includes(today.getUTCDay()) &&
    Math.max(now, openAt) + settings.smallOrderLeadHours * 60 * 60 * 1000 <= closeAt;

  res.json({
    today: formatDateOnly(today), // the shop's date (Vietnam time), not the visitor's device date
    now: new Date(now).toISOString(),
    asapAvailable,
    openTime: settings.openTime,
    closeTime: settings.closeTime,
    deliverySlots: settings.deliverySlots,
    closedWeekdays: settings.closedWeekdays,
    maxDaysAhead: settings.maxDaysAhead,
    largeOrderThreshold: settings.largeOrderThreshold,
    maxQuantityPerItem: settings.maxQuantityPerItem,
    smallOrderLeadHours: settings.smallOrderLeadHours,
    largeOrderLeadHours: settings.largeOrderLeadHours,
    unpaidCancelMinutes: settings.unpaidCancelMinutes,
    orderingPaused: settings.orderingPaused,
    pauseMessage: pickText(locale, settings.pauseMessageVi, settings.pauseMessageEn),
    deliveryZones: zones.map((zone) => ({
      id: zone.id,
      name: pickText(locale, zone.nameVi, zone.nameEn),
    })),
  });
});
