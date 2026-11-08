import { createHash, randomBytes, randomInt } from "crypto";
import type { AdminRole } from "@prisma/client";
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

export type AdminContext = {
  id: number;
  name: string;
  email: string;
  role: AdminRole;
  mustChangePassword: boolean;
};

declare module "express-serve-static-core" {
  interface Request {
    admin?: AdminContext;
  }
}

// Finds the signed-in account for this request, or answers 401 and returns null.
async function loadSession(req: Request, res: Response): Promise<AdminContext | null> {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length === 0) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return null;
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
    return null;
  }

  const user = session.adminUser;
  return { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword };
}

// Any signed-in account, even one that still has to replace its temporary password.
// Only for "who am I", "change my password" and similar routes.
export async function requireSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  const admin = await loadSession(req, res);
  if (!admin) return;
  req.admin = admin;
  next();
}

// Any signed-in account (admin or staff) that has set its own password.
export async function requireStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
  const admin = await loadSession(req, res);
  if (!admin) return;
  if (admin.mustChangePassword) {
    res.status(403).json({ error: "PASSWORD_CHANGE_REQUIRED" });
    return;
  }
  req.admin = admin;
  next();
}

// Use after requireStaff: only accounts with the ADMIN role may continue.
export function requireAdminRole(req: Request, res: Response, next: NextFunction): void {
  if (req.admin?.role !== "ADMIN") {
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }
  next();
}

// A one-time password the admin hands to a person; they must replace it at the next sign-in.
// Letters and digits that are easy to read aloud (no 0/O, 1/l/I), in groups like "k7mp-x3qr-9fta".
const TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function generateTemporaryPassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < 3; g += 1) {
    let group = "";
    for (let i = 0; i < 4; i += 1) group += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
    groups.push(group);
  }
  return groups.join("-");
}

// Signs an account out everywhere, optionally keeping the browser that made the change.
export async function deleteSessionsOf(adminUserId: number, exceptToken?: string): Promise<void> {
  await prisma.adminSession.deleteMany({
    where: {
      adminUserId,
      ...(exceptToken ? { NOT: { tokenHash: sha256(exceptToken) } } : {}),
    },
  });
}

// Removes expired sessions from the database (called by the background job).
export async function purgeExpiredSessions(): Promise<void> {
  await prisma.adminSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
