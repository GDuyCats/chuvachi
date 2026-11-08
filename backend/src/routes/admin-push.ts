import { Router } from "express";
import { z } from "zod";
import text from "../content/staff-alerts.json";
import { requireStaff } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { isAllowedPushEndpoint, pushPublicKey, sendPush } from "../lib/push";

// Lets each signed-in person switch push notifications on or off for the device they use.
export const adminPushRouter = Router();
adminPushRouter.use(requireStaff);

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
});

// GET /api/admin/push/public-key - the key browsers need to subscribe (null when push isn't set up)
adminPushRouter.get("/public-key", (_req, res) => {
  res.json({ publicKey: pushPublicKey() });
});

// POST /api/admin/push/subscribe - remember this device for the signed-in account
adminPushRouter.post("/subscribe", async (req, res) => {
  const parsed = subscriptionSchema.safeParse(req.body);
  if (!parsed.success || !isAllowedPushEndpoint(parsed.data.endpoint)) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const { endpoint, keys } = parsed.data;
  await prisma.adminPushSubscription.upsert({
    where: { endpoint },
    update: { adminUserId: req.admin!.id, p256dh: keys.p256dh, auth: keys.auth },
    create: { adminUserId: req.admin!.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });
  res.json({ ok: true });
});

// POST /api/admin/push/unsubscribe - forget this device
adminPushRouter.post("/unsubscribe", async (req, res) => {
  const parsed = z.object({ endpoint: z.string().max(1000) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  await prisma.adminPushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint, adminUserId: req.admin!.id } });
  res.json({ ok: true });
});

// POST /api/admin/push/test - send a test notification to the signed-in person's devices
adminPushRouter.post("/test", async (req, res) => {
  const sent = await sendPush(
    { title: text.test.pushTitle, body: text.test.pushBody, url: "/admin/notifications", tag: "test" },
    [req.admin!.id],
  );
  res.json({ sent });
});
