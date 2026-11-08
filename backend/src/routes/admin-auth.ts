import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  deleteSessionsOf,
  hashPassword,
  LOCK_MINUTES,
  MAX_FAILED_LOGINS,
  MIN_PASSWORD_LENGTH,
  requireSession,
  SESSION_COOKIE,
  setSessionCookie,
  spendPasswordCheckTime,
  verifyPassword,
} from "../lib/auth";
import { prisma } from "../lib/prisma";
import { rateLimitKey } from "../lib/client-ip";

export const adminAuthRouter = Router();

// Slows down password guessing from one device, on top of the per-account lock.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: rateLimitKey, // real visitor IP behind Cloudflare
  message: { error: "TOO_MANY_REQUESTS" },
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

// POST /api/admin/login
adminAuthRouter.post("/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "INVALID_CREDENTIALS" });
    return;
  }
  const { email, password } = parsed.data;

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin || !admin.isActive) {
    await spendPasswordCheckTime(password);
    res.status(401).json({ error: "INVALID_CREDENTIALS" });
    return;
  }

  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    res.status(423).json({ error: "ACCOUNT_LOCKED", lockedUntil: admin.lockedUntil.toISOString() });
    return;
  }

  const valid = await verifyPassword(admin.passwordHash, password);
  if (!valid) {
    const failedLogins = admin.failedLogins + 1;
    const lock = failedLogins >= MAX_FAILED_LOGINS;
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        failedLogins: lock ? 0 : failedLogins,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null,
      },
    });
    res.status(lock ? 423 : 401).json({ error: lock ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS" });
    return;
  }

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  const { token, expiresAt } = await createSession(admin.id);
  setSessionCookie(res, token, expiresAt);
  res.json({
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    mustChangePassword: admin.mustChangePassword,
    notifyNewOrders: admin.notifyNewOrders,
    expiresAt: expiresAt.toISOString(),
  });
});

// POST /api/admin/logout
adminAuthRouter.post("/logout", async (req, res) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string" && token.length > 0) {
    await deleteSession(token);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

// GET /api/admin/me - who is signed in (used by the admin pages to check the session)
adminAuthRouter.get("/me", requireSession, (req, res) => {
  res.json(req.admin);
});

const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  message: { error: "TOO_MANY_REQUESTS" },
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});

// POST /api/admin/me/password - change your own password (also used to replace a temporary one).
// Every other browser signed in to this account is signed out; this one stays signed in.
adminAuthRouter.post("/me/password", passwordLimiter, requireSession, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "PASSWORD_TOO_SHORT" });
    return;
  }
  const { currentPassword, newPassword } = parsed.data;

  const account = await prisma.adminUser.findUniqueOrThrow({ where: { id: req.admin!.id } });
  if (!(await verifyPassword(account.passwordHash, currentPassword))) {
    res.status(400).json({ error: "WRONG_CURRENT_PASSWORD" });
    return;
  }
  if (newPassword === currentPassword) {
    res.status(400).json({ error: "SAME_PASSWORD" });
    return;
  }

  await prisma.adminUser.update({
    where: { id: account.id },
    data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
  });
  const token = req.cookies?.[SESSION_COOKIE] as string;
  await deleteSessionsOf(account.id, token);
  console.log(`Password changed by ${account.email}`);
  res.json({ ...req.admin, mustChangePassword: false });
});

// PUT /api/admin/me/notifications - switch your own "new order" emails on or off
adminAuthRouter.put("/me/notifications", requireSession, async (req, res) => {
  const parsed = z.object({ notifyNewOrders: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  await prisma.adminUser.update({ where: { id: req.admin!.id }, data: { notifyNewOrders: parsed.data.notifyNewOrders } });
  res.json({ ...req.admin, notifyNewOrders: parsed.data.notifyNewOrders });
});
