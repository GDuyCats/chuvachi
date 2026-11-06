import { createHash, randomBytes } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "./prisma";

// Customer sign-in sessions (separate from staff sessions in lib/auth.ts).
export const CUSTOMER_COOKIE = "chuvachi_session";
const SESSION_DAYS = 30;
const COOKIE_PATH = "/api"; // sent to the public API (orders, account), never to other sites

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function createCustomerSession(customerId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.customerSession.create({ data: { tokenHash: sha256(token), customerId, expiresAt } });
  return { token, expiresAt };
}

export function setCustomerCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(CUSTOMER_COOKIE, token, {
    httpOnly: true, // JavaScript in the page can't read it
    secure: process.env.NODE_ENV === "production", // HTTPS only on the real site
    sameSite: "strict", // never sent from other websites (protects against CSRF)
    path: COOKIE_PATH,
    expires: expiresAt,
  });
}

export function clearCustomerCookie(res: Response): void {
  res.clearCookie(CUSTOMER_COOKIE, { path: COOKIE_PATH });
}

function tokenFrom(req: Request): string | null {
  const token: unknown = req.cookies?.[CUSTOMER_COOKIE];
  return typeof token === "string" && token.length > 0 ? token : null;
}

export async function deleteCustomerSession(req: Request): Promise<void> {
  const token = tokenFrom(req);
  if (token) await prisma.customerSession.deleteMany({ where: { tokenHash: sha256(token) } });
}

// The signed-in customer's id, or null for guests. Never fails: an expired or fake cookie
// simply means "guest".
export async function currentCustomerId(req: Request): Promise<number | null> {
  const token = tokenFrom(req);
  if (!token) return null;
  const session = await prisma.customerSession.findUnique({ where: { tokenHash: sha256(token) } });
  if (!session || session.expiresAt < new Date()) return null;
  return session.customerId;
}

declare module "express-serve-static-core" {
  interface Request {
    customerId?: number;
  }
}

// Protects account routes: continues only for a signed-in customer.
export async function requireCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
  const customerId = await currentCustomerId(req);
  if (!customerId) {
    clearCustomerCookie(res);
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }
  req.customerId = customerId;
  next();
}

// Removes expired sessions (called by the background job).
export async function purgeExpiredCustomerSessions(): Promise<void> {
  await prisma.customerSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
