import { createHash, randomBytes } from "crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import templates from "../content/email-templates.json";
import { deleteSessionsOf, hashPassword, MIN_PASSWORD_LENGTH } from "../lib/auth";
import { rateLimitKey } from "../lib/client-ip";
import { escapeHtml, sendEmail } from "../lib/email";
import { prisma } from "../lib/prisma";

// "Forgot password" for staff and admin accounts:
// 1. POST /request with an email: if an active account has it, a one-time link is emailed.
// 2. POST /confirm with the token from the link and a new password.
// The answer to step 1 is always the same, so nobody can find out which emails have accounts.
export const adminPasswordResetRouter = Router();

const LINK_MINUTES = 30;
const RESEND_GAP_MS = 60 * 1000; // at most one email per account per minute

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  message: { error: "TOO_MANY_REQUESTS" },
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// The website address, taken from ADMIN_URL (e.g. https://chuvachi.com/admin/orders).
function siteOrigin(): string {
  try {
    return new URL(process.env.ADMIN_URL ?? "").origin;
  } catch {
    return "http://localhost:3000";
  }
}

const requestSchema = z.object({ email: z.string().trim().toLowerCase().email().max(200) });

// POST /api/admin/password-reset/request
adminPasswordResetRouter.post("/request", limiter, (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  // Answer first, then do the work, so the response time doesn't reveal whether the email exists.
  res.json({ ok: true });
  void sendResetLink(parsed.data.email).catch((error: unknown) => {
    console.error("Password reset email failed:", error instanceof Error ? error.message : error);
  });
});

async function sendResetLink(email: string): Promise<void> {
  const account = await prisma.adminUser.findUnique({ where: { email } });
  if (!account || !account.isActive) return;

  const recent = await prisma.adminPasswordReset.findFirst({
    where: { adminUserId: account.id, usedAt: null, createdAt: { gt: new Date(Date.now() - RESEND_GAP_MS) } },
  });
  if (recent) return;

  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    // Only the newest link works.
    prisma.adminPasswordReset.deleteMany({ where: { adminUserId: account.id, usedAt: null } }),
    prisma.adminPasswordReset.create({
      data: {
        tokenHash: sha256(token),
        adminUserId: account.id,
        expiresAt: new Date(Date.now() + LINK_MINUTES * 60 * 1000),
      },
    }),
  ]);

  const link = `${siteOrigin()}/admin/reset-password#token=${token}`;
  const t = templates.passwordReset;
  const fill = (text: string) => text.replace("{name}", account.name).replace("{minutes}", String(LINK_MINUTES));
  const htmlPart = (part: typeof t.vi) =>
    `<p>${escapeHtml(fill(part.greeting))}</p>` +
    `<p>${escapeHtml(fill(part.body))}</p>` +
    `<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#000;color:#fff;padding:12px 20px;text-decoration:none;font-weight:bold">${escapeHtml(part.button)}</a></p>` +
    `<p style="color:#555">${escapeHtml(part.ignore)}</p>`;
  const textPart = (part: typeof t.vi) => [fill(part.greeting), fill(part.body), link, part.ignore].join("\n\n");

  const sent = await sendEmail({
    to: account.email,
    subject: t.subject,
    text: `${textPart(t.vi)}\n\n---\n\n${textPart(t.en)}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#000">${htmlPart(t.vi)}<hr>${htmlPart(t.en)}</div>`,
  });
  console.log(`Password reset link for account ${account.id}: ${sent ? "emailed" : "NOT emailed"}`);
}

const confirmSchema = z.object({
  token: z.string().min(20).max(200),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});

// POST /api/admin/password-reset/confirm
adminPasswordResetRouter.post("/confirm", limiter, async (req, res) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "PASSWORD_TOO_SHORT" });
    return;
  }

  const reset = await prisma.adminPasswordReset.findUnique({
    where: { tokenHash: sha256(parsed.data.token) },
    include: { adminUser: true },
  });
  if (!reset || reset.usedAt || reset.expiresAt < new Date() || !reset.adminUser.isActive) {
    res.status(400).json({ error: "LINK_INVALID" });
    return;
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  // Marking the link used and changing the password happen together; a second use finds usedAt set.
  const claimed = await prisma.$transaction(async (tx) => {
    const marked = await tx.adminPasswordReset.updateMany({
      where: { id: reset.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (marked.count === 0) return false;
    await tx.adminUser.update({
      where: { id: reset.adminUserId },
      data: { passwordHash, mustChangePassword: false, failedLogins: 0, lockedUntil: null },
    });
    return true;
  });
  if (!claimed) {
    res.status(400).json({ error: "LINK_INVALID" });
    return;
  }

  // Sign out every browser that used the old password.
  await deleteSessionsOf(reset.adminUserId);
  console.log(`Password reset by email for account ${reset.adminUserId}`);
  res.json({ ok: true });
});

// Removes old links (called by the background job).
export async function purgeOldPasswordResets(): Promise<void> {
  await prisma.adminPasswordReset.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
}
