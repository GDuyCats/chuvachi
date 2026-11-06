import type { Request } from "express";
import { ipKeyGenerator } from "express-rate-limit";

// The visitor's real IP address, used to count requests per visitor (rate limits).
//
// On the real site every request passes through Cloudflare, so the connection seems to come
// from Cloudflare's servers; the visitor's own address is in the "CF-Connecting-IP" header.
// That header is only trusted when TRUST_CLOUDFLARE=1, which is set on the server where the
// firewall lets in nothing but Cloudflare. Locally it's ignored, so nobody can fake it.
export function clientIp(req: Request): string {
  if (process.env.TRUST_CLOUDFLARE === "1") {
    const header = req.headers["cf-connecting-ip"];
    if (typeof header === "string" && header.length > 0 && header.length <= 45) {
      return header;
    }
  }
  return req.ip ?? "unknown";
}

// For express-rate-limit: groups IPv6 addresses by network, so one visitor can't dodge
// the limit by switching between the many addresses their provider gives them.
export function rateLimitKey(req: Request): string {
  return ipKeyGenerator(clientIp(req));
}
