import { Router } from "express";
import { prisma } from "../lib/prisma";

export const shopInfoRouter = Router();

// GET /api/shop-info - public contact details and opening hours (footer, product pages).
// Bank details are not included here; they are only shown after an order is placed.
shopInfoRouter.get("/shop-info", async (_req, res) => {
  const settings = await prisma.shopSetting.findUnique({ where: { id: 1 } });
  res.json({
    phone: settings?.phone ?? null,
    messengerUrl: settings?.messengerUrl ?? null,
    facebookUrl: settings?.facebookUrl ?? null,
    instagramUrl: settings?.instagramUrl ?? null,
    tiktokUrl: settings?.tiktokUrl ?? null,
    openTime: settings?.openTime ?? null,
    closeTime: settings?.closeTime ?? null,
    closedWeekdays: settings?.closedWeekdays ?? [],
    // Business details and order rules, for the footer and the policy pages
    legalName: settings?.legalName ?? null,
    legalAddress: settings?.legalAddress ?? null,
    registrationNumber: settings?.registrationNumber ?? null,
    contactEmail: settings?.contactEmail ?? null,
    dataRetentionMonths: settings?.dataRetentionMonths ?? 12,
    unpaidCancelMinutes: settings?.unpaidCancelMinutes ?? 30,
    smallOrderLeadHours: settings?.smallOrderLeadHours ?? 3,
    largeOrderLeadHours: settings?.largeOrderLeadHours ?? 24,
    largeOrderThreshold: settings?.largeOrderThreshold ?? 10,
  });
});
