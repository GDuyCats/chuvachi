import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import { z } from "zod";
import {
  clearCustomerCookie,
  createCustomerSession,
  currentCustomerId,
  deleteCustomerSession,
  requireCustomer,
  setCustomerCookie,
} from "../lib/customer-auth";
import { parseLocale, pickText } from "../lib/locale";
import { normalizePhone, PHONE_PATTERN } from "../lib/phone";
import { prisma } from "../lib/prisma";
import { formatDateOnly } from "../lib/time";
import { describeItem, findOrderForAccount } from "../services/order-service";
import { deleteCustomerReviewContent } from "../services/review-service";
import { rateLimitKey } from "../lib/client-ip";

export const accountRouter = Router();

const googleClient = new OAuth2Client();

const signInLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: rateLimitKey, // real visitor IP behind Cloudflare
  message: { error: "TOO_MANY_REQUESTS" },
});

// Linking a guest order needs its code and phone number, so limit guessing.
const claimLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: rateLimitKey, // real visitor IP behind Cloudflare
  message: { error: "TOO_MANY_REQUESTS" },
});

function toProfile(customer: {
  name: string;
  email: string;
  avatarUrl: string | null;
  phone: string | null;
  defaultAddress: string | null;
  defaultZoneId: number | null;
}) {
  const { name, email, avatarUrl, phone, defaultAddress, defaultZoneId } = customer;
  return { name, email, avatarUrl, phone, defaultAddress, defaultZoneId };
}

// ---------- Sign in with Google ----------

// POST /api/account/google  { credential }
// The browser gets a signed "ID token" from Google; we check Google's signature, that it was
// made for our website, and that the email is verified. The first sign-in creates the account.
accountRouter.post("/account/google", signInLimiter, async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const credential = typeof req.body?.credential === "string" ? req.body.credential : "";
  if (!clientId) {
    res.status(503).json({ error: "SIGN_IN_NOT_CONFIGURED" });
    return;
  }
  if (!credential || credential.length > 4096) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }

  let payload: TokenPayload | undefined;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: clientId });
    payload = ticket.getPayload();
  } catch {
    res.status(401).json({ error: "INVALID_GOOGLE_TOKEN" });
    return;
  }
  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    res.status(401).json({ error: "INVALID_GOOGLE_TOKEN" });
    return;
  }

  const name = (payload.name ?? payload.email.split("@")[0]).slice(0, 100);
  const customer = await prisma.customer.upsert({
    where: { googleSub: payload.sub },
    update: { email: payload.email, avatarUrl: payload.picture ?? null, lastLoginAt: new Date() },
    create: { googleSub: payload.sub, email: payload.email, name, avatarUrl: payload.picture ?? null },
  });

  const { token, expiresAt } = await createCustomerSession(customer.id);
  setCustomerCookie(res, token, expiresAt);
  res.json(toProfile(customer));
});

// POST /api/account/logout
accountRouter.post("/account/logout", async (req, res) => {
  await deleteCustomerSession(req);
  clearCustomerCookie(res);
  res.json({ ok: true });
});

// ---------- Profile ----------

// GET /api/account/session - the signed-in customer, or { profile: null } for guests.
// Used on every page (header icon), so guests get a normal answer instead of an error.
accountRouter.get("/account/session", async (req, res) => {
  const customerId = await currentCustomerId(req);
  const customer = customerId ? await prisma.customer.findUnique({ where: { id: customerId } }) : null;
  res.json({ profile: customer ? toProfile(customer) : null });
});

// GET /api/account/me
accountRouter.get("/account/me", requireCustomer, async (req, res) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.customerId! } });
  if (!customer) {
    clearCustomerCookie(res);
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }
  res.json(toProfile(customer));
});

const profileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .trim()
    .refine((value) => value === "" || PHONE_PATTERN.test(normalizePhone(value)), "Invalid phone number")
    .transform((value) => (value === "" ? null : normalizePhone(value))),
  defaultAddress: z
    .string()
    .trim()
    .max(300)
    .transform((value) => (value === "" ? null : value)),
  defaultZoneId: z.number().int().positive().nullable(),
});

// PUT /api/account/me  - details used to fill in the checkout form
accountRouter.put("/account/me", requireCustomer, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      details: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    });
    return;
  }
  const customer = await prisma.customer.update({ where: { id: req.customerId! }, data: parsed.data });
  res.json(toProfile(customer));
});

// DELETE /api/account/me - the customer deletes their account.
// Their orders stay (the shop needs them for its accounts) but are no longer linked to the account.
// Their reviews, comments, votes and photos are deleted.
accountRouter.delete("/account/me", requireCustomer, async (req, res) => {
  await deleteCustomerReviewContent(req.customerId!);
  await prisma.$transaction([
    prisma.order.updateMany({ where: { customerId: req.customerId! }, data: { customerId: null } }),
    prisma.customer.delete({ where: { id: req.customerId! } }), // sessions are deleted with it
  ]);
  clearCustomerCookie(res);
  res.json({ ok: true });
});

// ---------- Orders ----------

// GET /api/account/orders?locale=vi|en - the customer's orders, newest first
accountRouter.get("/account/orders", requireCustomer, async (req, res) => {
  const locale = parseLocale(req.query.locale);
  const orders = await prisma.order.findMany({
    where: { customerId: req.customerId! },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { items: true, deliveryZone: true },
  });
  res.json(
    orders.map((order) => ({
      code: order.code,
      status: order.status,
      paymentStatus: order.paymentStatus,
      deliveryType: order.deliveryType,
      deliveryDate: formatDateOnly(order.deliveryDate),
      deliverySlot: order.deliverySlot,
      deliveryZone: pickText(locale, order.deliveryZone.nameVi, order.deliveryZone.nameEn),
      total: order.total,
      cancelReason: order.cancelReason,
      cancelNote: order.cancelNote,
      items: order.items.map((item) => ({
        name: describeItem(item.nameSnapshot, item.optionsSnapshot, locale),
        quantity: item.quantity,
      })),
      createdAt: order.createdAt.toISOString(),
    })),
  );
});

const claimSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,12}$/),
  phone: z.string().trim().min(8).max(20),
});

// POST /api/account/orders/claim  { code, phone }
// Adds an order placed as a guest to the account. Needs the order's code and phone number.
// GET /api/account/orders/:code?locale=vi - one order of the signed-in customer, same view as
// the Track order page (opened from a notification or the "My orders" list, no phone needed)
accountRouter.get("/account/orders/:code", requireCustomer, async (req, res) => {
  const code = String(req.params.code);
  if (!/^[A-Za-z0-9]{4,12}$/.test(code)) {
    res.status(400).json({ error: "INVALID_LOOKUP" });
    return;
  }
  const order = await findOrderForAccount(code, req.customerId!, parseLocale(req.query.locale));
  if (!order) {
    res.status(404).json({ error: "ORDER_NOT_FOUND" });
    return;
  }
  res.json(order);
});

accountRouter.post("/account/orders/claim", requireCustomer, claimLimiter, async (req, res) => {
  const parsed = claimSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const order = await prisma.order.findUnique({
    where: { code: parsed.data.code },
    select: { id: true, customerPhone: true, customerId: true, anonymizedAt: true },
  });
  // Same answer for a wrong code and a wrong phone, so nothing can be guessed.
  if (!order || order.anonymizedAt || order.customerPhone !== normalizePhone(parsed.data.phone)) {
    res.status(404).json({ error: "ORDER_NOT_FOUND" });
    return;
  }
  if (order.customerId !== null && order.customerId !== req.customerId) {
    res.status(409).json({ error: "ORDER_IN_OTHER_ACCOUNT" });
    return;
  }
  await prisma.order.update({ where: { id: order.id }, data: { customerId: req.customerId! } });
  res.json({ ok: true });
});
