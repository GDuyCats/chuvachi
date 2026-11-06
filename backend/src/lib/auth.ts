import { createHash, randomBytes } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { hash, verify } from "@node-rs/argon2";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "chuvachi_admin";
const SESSION_HOURS = 12;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
export const MIN_PASSWORD_LENGTH = 12;

// ---------- Passwords ----------

// argon2id is the recommended algorithm for storing passwords.
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Used when the email doesn't exist, so a wrong email takes as long as a wrong password
// (otherwise the response time would reveal which emails are real).
let dummyHash: Promise<string> | null = null;
export async function spendPasswordCheckTime(password: string): Promise<void> {
  dummyHash ??= hash("not-a-real-password-just-for-timing");
  await verifyPassword(await dummyHash, password);
}

// ---------- Sessions ----------

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function createSession(adminUserId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await prisma.adminSession.create({
    data: { tokenHash: sha256(token), adminUserId, expiresAt },
  });
  return { token, expiresAt };
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.adminSession.deleteMany({ where: { tokenHash: sha256(token) } });
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, // JavaScript in the page can't read it
    secure: process.env.NODE_ENV === "production", // HTTPS only on the real site
    sameSite: "strict", // never sent from other websites (protects against CSRF)
    path: "/api/admin", // only sent to admin API routes
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: "/api/admin" });
}

export type AdminContext = { id: number; name: string; email: string };

declare module "express-serve-static-core" {
  interface Request {
    admin?: AdminContext;
  }
}

// Protects admin routes: continues only for a valid, unexpired session of an active admin.
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length === 0) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { adminUser: true },
  });
  if (!session || session.expiresAt < new Date() || !session.adminUser.isActive) {
    if (session) {
      await prisma.adminSession.delete({ where: { id: session.id } });
    }
    clearSessionCookie(res);
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  req.admin = { id: session.adminUser.id, name: session.adminUser.name, email: session.adminUser.email };
  next();
}

// Removes expired sessions from the database (called by the background job).
export async function purgeExpiredSessions(): Promise<void> {
  await prisma.adminSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
