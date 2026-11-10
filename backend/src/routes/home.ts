import { Router } from "express";
import { prisma } from "../lib/prisma";
import { parseLocale, pickText } from "../lib/locale";
import { formatDateOnly, vietnamToday } from "../lib/time";

export const homeRouter = Router();

// The "from" price on a card: one portion with the cheapest active flavor.
function startingPrice(basePrice: number, options: { type: string; priceDelta: number }[]): number {
  const extras = options.filter((o) => o.type === "FLAVOR").map((o) => o.priceDelta);
  return basePrice + (extras.length > 0 ? Math.min(...extras) : 0);
}

// GET /api/home?locale=vi|en - everything the homepage and the top bar need, in one language.
homeRouter.get("/home", async (req, res) => {
  const locale = parseLocale(req.query.locale);
  const text = (vi: string | null, en: string | null) => pickText(locale, vi, en)?.trim() || null;
  const today = vietnamToday();

  const [content, categories, newCount, season, comingSoon, extraSlides] = await Promise.all([
    prisma.homeContent.findUnique({
      where: { id: 1 },
      include: {
        heroProduct: { select: { slug: true, isActive: true } },
        announcementProduct: { select: { slug: true, isActive: true } },
      },
    }),
    // Only categories that have something to buy
    prisma.category.findMany({
      where: { products: { some: { isActive: true } } },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.product.count({ where: { isActive: true, isNew: true } }),
    // The running season; if two overlap, the one that started last wins.
    prisma.season.findFirst({
      where: { isActive: true, startDate: { lte: today }, endDate: { gte: today } },
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
      include: {
        products: {
          where: { product: { isActive: true } },
          orderBy: { sortOrder: "asc" },
          include: { product: { include: { options: { where: { isActive: true } } } } },
        },
      },
    }),
    prisma.comingSoonItem.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    // Extra banner slides that are switched on and inside their dates (if they have any).
    prisma.heroSlide.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: today } }] },
          { OR: [{ endDate: null }, { endDate: { gte: today } }] },
        ],
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { product: { select: { slug: true, isActive: true } } },
    }),
  ]);

  const linkSlug = (product: { slug: string; isActive: boolean } | null) => (product?.isActive ? product.slug : null);

  const announcement = content
    ? {
        left: text(content.announcementLeftVi, content.announcementLeftEn),
        center: text(content.announcementCenterVi, content.announcementCenterEn),
        right: text(content.announcementRightVi, content.announcementRightEn),
        productSlug: linkSlug(content.announcementProduct),
      }
    : null;

  const heroTitle = content ? text(content.heroTitleVi, content.heroTitleEn) : null;
  const hero =
    content && content.heroIsActive && heroTitle
      ? {
          eyebrow: text(content.heroEyebrowVi, content.heroEyebrowEn),
          title: heroTitle,
          subtitle: text(content.heroSubtitleVi, content.heroSubtitleEn),
          cta: text(content.heroCtaVi, content.heroCtaEn),
          imageUrl: content.heroImageUrl,
          productSlug: linkSlug(content.heroProduct),
        }
      : null;

  // The banner: the main slide first, then the extra ones.
  const heroSlides = [
    ...(hero ? [hero] : []),
    ...(content?.heroIsActive === false
      ? []
      : extraSlides.map((slide) => ({
          eyebrow: text(slide.eyebrowVi, slide.eyebrowEn),
          title: text(slide.titleVi, slide.titleEn) ?? "",
          subtitle: text(slide.subtitleVi, slide.subtitleEn),
          cta: text(slide.ctaVi, slide.ctaEn),
          imageUrl: slide.imageUrl,
          productSlug: linkSlug(slide.product),
        }))),
  ].filter((slide) => slide.title !== "");

  res.json({
    announcement,
    hero,
    heroSlides,
    heroInterval: content?.heroIntervalSeconds ?? 6,
    hasNew: newCount > 0,
    categories: categories.map((c) => ({ slug: c.slug, name: pickText(locale, c.nameVi, c.nameEn) })),
    season:
      season && season.products.length > 0
        ? {
            name: pickText(locale, season.nameVi, season.nameEn),
            eyebrow: text(season.eyebrowVi, season.eyebrowEn),
            description: text(season.descriptionVi, season.descriptionEn),
            endDate: formatDateOnly(season.endDate),
            products: season.products.map(({ product }) => ({
              slug: product.slug,
              name: pickText(locale, product.nameVi, product.nameEn),
              price: startingPrice(product.basePrice, product.options),
              isNew: product.isNew,
              availability: product.availability,
              imageUrl: product.imageUrl,
            })),
          }
        : null,
    comingSoon: comingSoon.map((item) => ({
      id: item.id,
      dateLabel: item.dateLabel,
      name: pickText(locale, item.nameVi, item.nameEn),
      note: text(item.noteVi, item.noteEn),
    })),
  });
});
