import { Router } from "express";
import { PaymentMethod } from "@prisma/client";
import { z } from "zod";
import { normalizePhone, PHONE_PATTERN } from "../lib/phone";
import { prisma } from "../lib/prisma";
import { createOrder, findOrderForCustomer, OrderError } from "../services/order-service";

export const ordersRouter = Router();

const phoneSchema = z
  .string()
  .trim()
  .refine((value) => PHONE_PATTERN.test(normalizePhone(value)), "Invalid phone number");

const orderItemSchema = z.object({
  productId: z.number().int().positive(),
  flavorOptionId: z.number().int().positive().optional(),
  packageOptionId: z.number().int().positive().optional(),
  quantity: z.number().int().min(1).max(100),
  note: z.string().trim().max(200).optional(),
});

const createOrderSchema = z.object({
  customerName: z.string().trim().min(1).max(100),
  customerPhone: phoneSchema,
  address: z.string().trim().min(5).max(300),
  note: z.string().trim().max(500).optional(),
  deliveryZoneId: z.number().int().positive(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD"),
  deliverySlot: z.string().min(1),
  paymentMethod: z.nativeEnum(PaymentMethod),
  locale: z.enum(["vi", "en"]).default("vi"),
  items: z.array(orderItemSchema).min(1).max(30),
});

// POST /api/orders - place a new order
ordersRouter.post("/orders", async (req, res) => {
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
    const order = await createOrder(parsed.data);
    res.status(201).json(order);
  } catch (error) {
    if (error instanceof OrderError) {
      res.status(error.status).json({ error: error.code, message: error.message });
      return;
    }
    throw error;
  }
});

// GET /api/orders/:code?phone=0912345678 - customer looks up their order
ordersRouter.get("/orders/:code", async (req, res) => {
  const phone = typeof req.query.phone === "string" ? req.query.phone : "";
  if (!phone) {
    res.status(400).json({ error: "PHONE_REQUIRED", message: "Phone number is required" });
    return;
  }

  const order = await findOrderForCustomer(req.params.code, phone);
  if (!order) {
    res.status(404).json({ error: "ORDER_NOT_FOUND", message: "Order not found" });
    return;
  }

  res.json(order);
});

// GET /api/order-settings - rules the checkout page needs (slots, closed days, lead times)
ordersRouter.get("/order-settings", async (_req, res) => {
  const settings = await prisma.shopSetting.findUnique({ where: { id: 1 } });
  if (!settings) {
    res.status(500).json({ error: "SHOP_NOT_CONFIGURED", message: "Shop settings are missing" });
    return;
  }

  res.json({
    deliverySlots: settings.deliverySlots,
    closedWeekdays: settings.closedWeekdays,
    maxDaysAhead: settings.maxDaysAhead,
    largeOrderThreshold: settings.largeOrderThreshold,
    smallOrderLeadHours: settings.smallOrderLeadHours,
    largeOrderLeadHours: settings.largeOrderLeadHours,
  });
});
