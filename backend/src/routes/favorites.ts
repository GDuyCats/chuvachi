import type { Request } from "express";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { rateLimitKey } from "../lib/client-ip";
import { currentCustomerId } from "../lib/customer-auth";
import { parseLocale, pickText } from "../lib/locale";
import { prisma } from "../lib/prisma";

// Favorite cakes. Signed-in customers keep them in their account. Guests keep them in their
// browser; when that browser has push notifications on, they are also stored here (linked to the
// browser) so it can be told when a favorite is back in stock, cheaper, etc.
// Every call is POST so the push endpoint never ends up in a URL or a log line.
export const favoritesRouter = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  message: { error: "TOO_MANY_REQUESTS" },
});

const MAX_FAVORITES = 200;
const endpoint = z.string().url().max(1000).optional();
const productId = z.number().int().positive();

// Whose favorites: the signed-in account, else the guest browser with push on, else nobody
// (the browser then keeps them on its own).
type Owner = { customerId: number } | { subscriptionId: number } | null;

async function ownerOf(req: Request, pushEndpoint: string | undefined): Promise<Owner> {
  const customerId = await currentCustomerId(req);
  if (customerId) return { customerId };
  if (!pushEndpoint) return null;
  const subscription = await prisma.customerPushSubscription.findUnique({ where: { endpoint: pushEndpoint }, select: { id: true } });
  return subscription ? { subscriptionId: subscription.id } : null;
}

// The favorites list with what the account page shows, and the "new cakes" choice.
async function listFor(owner: Owner, locale: "vi" | "en") {
  if (!owner) return { saved: false, ids: [] as number[], items: [], newCakeAlerts: false };
  const favorites = await prisma.favorite.findMany({
    where: owner,
    orderBy: { createdAt: "desc" },
    include: { product: { select: { id: true, slug: true, nameVi: true, nameEn: true, imageUrl: true, isActive: true, availability: true } } },
  });
  const choice =
    "customerId" in owner
      ? (await prisma.customer.findUnique({ where: { id: owner.customerId }, select: { newCakeAlerts: true } }))?.newCakeAlerts
      : (await prisma.customerPushSubscription.findUnique({ where: { id: owner.subscriptionId }, select: { newCakeAlerts: true } }))
          ?.newCakeAlerts;
  const visible = favorites.filter((favorite) => favorite.product.isActive);
  return {
    saved: true,
    ids: visible.map((favorite) => favorite.productId),
    items: visible.map(({ product }) => ({
      id: product.id,
      slug: product.slug,
      name: pickText(locale, product.nameVi, product.nameEn),
      imageUrl: product.imageUrl,
      availability: product.availability,
    })),
    // Not chosen yet: on once they have a favorite.
    newCakeAlerts: choice ?? favorites.length > 0,
  };
}

// Only cakes that exist and are shown to customers can be hearted.
async function existingProducts(ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.product.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } });
  return rows.map((row) => row.id);
}

// POST /api/favorites/list  { endpoint?, locale } - this visitor's favorites as stored here
favoritesRouter.post("/favorites/list", limiter, async (req, res) => {
  const parsed = z.object({ endpoint, locale: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  res.json(await listFor(await ownerOf(req, parsed.data.endpoint), parseLocale(parsed.data.locale)));
});

// POST /api/favorites/toggle  { productId, on, endpoint? } - heart or un-heart one cake
favoritesRouter.post("/favorites/toggle", limiter, async (req, res) => {
  const parsed = z.object({ productId, on: z.boolean(), endpoint }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const owner = await ownerOf(req, parsed.data.endpoint);
  if (!owner) {
    res.json({ saved: false }); // kept in the browser only
    return;
  }
  if (!parsed.data.on) {
    await prisma.favorite.deleteMany({ where: { ...owner, productId: parsed.data.productId } });
  } else {
    const [valid, count] = await Promise.all([existingProducts([parsed.data.productId]), prisma.favorite.count({ where: owner })]);
    if (valid.length === 0) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    if (count < MAX_FAVORITES) {
      await prisma.favorite.createMany({ data: [{ ...owner, productId: parsed.data.productId }], skipDuplicates: true });
    }
  }
  res.json({ saved: true });
});

// POST /api/favorites/merge  { productIds, endpoint?, locale } - adds the favorites kept in the browser
// (e.g. right after signing in, or after switching notifications on) and returns the full list.
favoritesRouter.post("/favorites/merge", limiter, async (req, res) => {
  const parsed = z
    .object({ productIds: z.array(productId).max(MAX_FAVORITES), endpoint, locale: z.string().optional() })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const owner = await ownerOf(req, parsed.data.endpoint);
  if (owner) {
    const valid = await existingProducts([...new Set(parsed.data.productIds)]);
    const room = MAX_FAVORITES - (await prisma.favorite.count({ where: owner }));
    if (room > 0 && valid.length > 0) {
      await prisma.favorite.createMany({
        data: valid.slice(0, room).map((id) => ({ ...owner, productId: id })),
        skipDuplicates: true,
      });
    }
  }
  res.json(await listFor(owner, parseLocale(parsed.data.locale)));
});

// POST /api/favorites/new-cakes  { on, endpoint? } - "tell me when there is a new cake"
favoritesRouter.post("/favorites/new-cakes", limiter, async (req, res) => {
  const parsed = z.object({ on: z.boolean(), endpoint }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR" });
    return;
  }
  const owner = await ownerOf(req, parsed.data.endpoint);
  if (!owner) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }
  if ("customerId" in owner) {
    await prisma.customer.update({ where: { id: owner.customerId }, data: { newCakeAlerts: parsed.data.on } });
  } else {
    await prisma.customerPushSubscription.update({ where: { id: owner.subscriptionId }, data: { newCakeAlerts: parsed.data.on } });
  }
  res.json({ ok: true });
});
