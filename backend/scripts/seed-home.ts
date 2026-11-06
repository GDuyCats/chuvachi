// Fills the homepage with starter content, once.
// Safe to run on the real database: it only adds what is still missing and never
// changes anything staff already edited in the admin page.
//
// Run from the backend folder:  yarn seed:home

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { vietnamToday } from "../src/lib/time";

type HomeSeed = {
  content: Omit<Prisma.HomeContentUncheckedCreateInput, "id" | "heroProductId" | "announcementProductId">;
  featuredProductSlug: string;
  season: { nameVi: string; nameEn: string; eyebrowVi: string; eyebrowEn: string; descriptionVi: string; descriptionEn: string };
  comingSoon: { dateLabel: string; nameVi: string; nameEn: string; noteVi: string; noteEn: string }[];
};

const prisma = new PrismaClient();

async function main() {
  const seed = JSON.parse(readFileSync(join(__dirname, "..", "prisma", "home-seed.json"), "utf8")) as HomeSeed;
  const featured = await prisma.product.findUnique({ where: { slug: seed.featuredProductSlug }, select: { id: true } });

  if (await prisma.homeContent.findUnique({ where: { id: 1 } })) {
    console.log("Homepage texts: already set, skipped.");
  } else {
    await prisma.homeContent.create({
      data: {
        id: 1,
        ...seed.content,
        heroProductId: featured?.id ?? null,
        announcementProductId: featured?.id ?? null,
      },
    });
    console.log("Homepage texts: added.");
  }

  if ((await prisma.season.count()) > 0) {
    console.log("Seasons: already set, skipped.");
  } else {
    // A season covering the current month, with every cake on the menu.
    const today = vietnamToday();
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
    const products = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    await prisma.season.create({
      data: {
        ...seed.season,
        startDate: start,
        endDate: end,
        products: { create: products.map((p, index) => ({ productId: p.id, sortOrder: index })) },
      },
    });
    console.log("Seasons: added one for this month.");
  }

  if ((await prisma.comingSoonItem.count()) > 0) {
    console.log("Coming soon: already set, skipped.");
  } else {
    await prisma.comingSoonItem.createMany({
      data: seed.comingSoon.map((item, index) => ({ ...item, sortOrder: index + 1 })),
    });
    console.log("Coming soon: added.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
