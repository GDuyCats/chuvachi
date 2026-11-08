import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { isTelegramConfigured, sendTelegram } from "../lib/telegram";
import { clockToMinutes, formatDateOnly, parseDateOnly, vietnamToday } from "../lib/time";

export const adminSettingsRouter = Router();
adminSettingsRouter.use(requireAdmin);

const DAY_MS = 24 * 60 * 60 * 1000;
const CAPACITY_DAYS = 14;

// ---------- Validation helpers ----------

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
const slot = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM-HH:MM")
  .refine((value) => {
    const [start, end] = value.split("-");
    return clockToMinutes(start) < clockToMinutes(end);
  }, "The slot must end after it starts");

// Empty text means "not set". Links must be https so we never point customers to unsafe pages.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable();
const optionalHttpsUrl = z
  .string()
  .trim()
  .max(300)
  .refine((value) => value === "" || /^https:\/\/[^\s]+$/.test(value), "Must start with https://")
  .transform((value) => (value === "" ? null : value))
  .nullable();

const settingsSchema = z
  .object({
    openTime: clock,
    closeTime: clock,
    closedWeekdays: z.array(z.number().int().min(0).max(6)).max(7),
    deliverySlots: z.array(slot).min(1).max(12),
    smallOrderLeadHours: z.number().int().min(0).max(72),
    largeOrderLeadHours: z.number().int().min(0).max(168),
    largeOrderThreshold: z.number().int().min(1).max(1000),
    defaultDailyCapacity: z.number().int().min(0).max(10000),
    maxDaysAhead: z.number().int().min(0).max(60),
    unpaidCancelMinutes: z.number().int().min(0).max(24 * 60),
    bankBin: z
      .string()
      .trim()
      .refine((value) => value === "" || /^\d{6}$/.test(value), "Bank code has 6 digits")
      .transform((value) => (value === "" ? null : value))
      .nullable(),
    bankName: optionalText(100),
    bankAccountNumber: z
      .string()
      .trim()
      .refine((value) => value === "" || /^[0-9]{4,20}$/.test(value), "Digits only")
      .transform((value) => (value === "" ? null : value))
      .nullable(),
    bankAccountName: optionalText(100),
    phone: optionalText(20),
    messengerUrl: optionalHttpsUrl,
    facebookUrl: optionalHttpsUrl,
    instagramUrl: optionalHttpsUrl,
    tiktokUrl: optionalHttpsUrl,
    legalName: optionalText(150),
    legalAddress: optionalText(300),
    registrationNumber: optionalText(50),
    contactEmail: z
      .string()
      .trim()
      .max(200)
      .refine((value) => value === "" || z.string().email().safeParse(value).success, "Invalid email")
      .transform((value) => (value === "" ? null : value.toLowerCase()))
      .nullable(),
    dataRetentionMonths: z.number().int().min(1).max(120),
    orderingPaused: z.boolean(),
    pauseMessageVi: optionalText(200),
    pauseMessageEn: optionalText(200),
  })
  .refine((data) => clockToMinutes(data.openTime) < clockToMinutes(data.closeTime), {
    message: "Closing time must be after opening time",
    path: ["closeTime"],
  });

function validationError(res: import("express").Response, error: z.ZodError) {
  res.status(400).json({
    error: "VALIDATION_ERROR",
    details: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
  });
}

// ---------- Shop settings ----------

async function loadEverything() {
  const today = vietnamToday();
  const until = new Date(today.getTime() + (CAPACITY_DAYS - 1) * DAY_MS);
  const [settings, zones, capacities] = await Promise.all([
    prisma.shopSetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
    prisma.deliveryZone.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.dailyCapacity.findMany({ where: { date: { gte: today, lte: until } } }),
  ]);

  const byDate = new Map(capacities.map((c) => [formatDateOnly(c.date), c]));
  const days = Array.from({ length: CAPACITY_DAYS }, (_, i) => {
    const date = formatDateOnly(new Date(today.getTime() + i * DAY_MS));
    const row = byDate.get(date);
    return {
      date,
      maxPortions: row?.maxPortions ?? settings.defaultDailyCapacity,
      bookedPortions: row?.bookedPortions ?? 0,
      isCustom: Boolean(row && row.maxPortions !== settings.defaultDailyCapacity),
    };
  });

  const { id: _id, updatedAt: _updatedAt, ...editable } = settings;
  return {
    settings: editable,
    zones: zones.map(({ id, nameVi, nameEn, isActive, sortOrder }) => ({ id, nameVi, nameEn, isActive, sortOrder })),
    capacity: days,
  };
}

// GET /api/admin/settings
adminSettingsRouter.get("/settings", async (_req, res) => {
  res.json(await loadEverything());
});

// PUT /api/admin/settings
adminSettingsRouter.put("/settings", async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    validationError(res, parsed.error);
    return;
  }
  const data = { ...parsed.data, deliverySlots: [...new Set(parsed.data.deliverySlots)].sort() };
  await prisma.shopSetting.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  console.log(`Shop settings updated by admin ${req.admin!.email}`);
  res.json(await loadEverything());
});

// ---------- Delivery areas ----------

const zoneSchema = z.object({
  nameVi: z.string().trim().min(1).max(80),
  nameEn: z.string().trim().min(1).max(80),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

// POST /api/admin/zones
adminSettingsRouter.post("/zones", async (req, res) => {
  const parsed = zoneSchema.safeParse(req.body);
  if (!parsed.success) {
    validationError(res, parsed.error);
    return;
  }
  await prisma.deliveryZone.create({ data: parsed.data });
  res.status(201).json(await loadEverything());
});

// PUT /api/admin/zones/:id  (areas are switched off rather than deleted, so old orders keep their area)
adminSettingsRouter.put("/zones/:id", async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const parsed = zoneSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const updated = await prisma.deliveryZone.updateMany({ where: { id: id.data }, data: parsed.data });
  if (updated.count === 0) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  res.json(await loadEverything());
});

// ---------- Portions per day ----------

const capacitySchema = z.object({ maxPortions: z.number().int().min(0).max(10000) });

// PUT /api/admin/capacity/:date  { maxPortions }
adminSettingsRouter.put("/capacity/:date", async (req, res) => {
  const date = parseDateOnly(req.params.date);
  const parsed = capacitySchema.safeParse(req.body);
  if (!date || !parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  if (date < vietnamToday()) {
    res.status(400).json({ error: "PAST_DATE" });
    return;
  }
  // Lowering below what's already booked only stops new orders; existing ones stay.
  await prisma.dailyCapacity.upsert({
    where: { date },
    update: { maxPortions: parsed.data.maxPortions },
    create: { date, maxPortions: parsed.data.maxPortions },
  });
  res.json(await loadEverything());
});

// ---------- Telegram ----------

// POST /api/admin/telegram/test - sends a test message so staff can check the setup.
adminSettingsRouter.post("/telegram/test", async (req, res) => {
  if (!isTelegramConfigured()) {
    res.status(503).json({ error: "TELEGRAM_NOT_CONFIGURED" });
    return;
  }
  const ok = await sendTelegram(`✅ Chuvachi test message, sent by ${req.admin!.name}. Notifications are working.`);
  if (!ok) {
    res.status(502).json({ error: "TELEGRAM_FAILED" });
    return;
  }
  res.json({ ok: true });
});
