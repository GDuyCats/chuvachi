import type { NextFunction, Request, Response } from "express";
import { clientIp } from "./client-ip";

// Cloudflare Turnstile: a "are you a person?" check that is usually invisible.
// The browser sends a one-time token in the X-Turnstile-Token header; we ask Cloudflare whether
// it is valid. Without TURNSTILE_SECRET_KEY (local development) the check is skipped.

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TOKEN_HEADER = "x-turnstile-token";

async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token || token.length > 2048) return false;

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(8000),
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    // Cloudflare unreachable: refuse rather than let bots through; the customer can retry.
    console.error("Turnstile verification failed (network)");
    return false;
  }
}

// Route guard: continues only when the request carries a valid Turnstile token.
export async function requireHuman(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers[TOKEN_HEADER];
  const token = typeof header === "string" ? header : undefined;
  if (await verifyTurnstile(token, clientIp(req))) {
    next();
    return;
  }
  res.status(403).json({ error: "BOT_CHECK_FAILED" });
}
