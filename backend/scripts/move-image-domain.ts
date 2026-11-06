// Changes the address of every saved photo from one domain to another, for example
// after connecting a custom domain to the R2 bucket:
//
//   yarn images:move https://pub-xxxx.r2.dev https://img.chuvachi.com
//
// Only the start of each address changes; the files themselves stay where they are.
// Run it once on each database (dev, and later production).

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function cleanBase(value: string | undefined): string {
  const base = (value ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^\s/]+$/.test(base)) {
    console.error('Usage: yarn images:move <old address> <new address>  (both like "https://img.example.com")');
    process.exit(1);
  }
  return base;
}

async function main() {
  const from = cleanBase(process.argv[2]);
  const to = cleanBase(process.argv[3]);
  const move = (url: string | null) => (url && url.startsWith(`${from}/`) ? `${to}${url.slice(from.length)}` : url);

  const products = await prisma.product.findMany({ select: { id: true, imageUrl: true, images: true } });
  let changedProducts = 0;
  for (const product of products) {
    const imageUrl = move(product.imageUrl);
    const images = product.images.map((url) => move(url) ?? url);
    if (imageUrl !== product.imageUrl || images.some((url, i) => url !== product.images[i])) {
      await prisma.product.update({ where: { id: product.id }, data: { imageUrl, images } });
      changedProducts += 1;
    }
  }

  const home = await prisma.homeContent.findUnique({ where: { id: 1 }, select: { heroImageUrl: true } });
  const heroImageUrl = move(home?.heroImageUrl ?? null);
  const changedHome = home && heroImageUrl !== home.heroImageUrl;
  if (changedHome) {
    await prisma.homeContent.update({ where: { id: 1 }, data: { heroImageUrl } });
  }

  console.log(`Updated ${changedProducts} product(s)${changedHome ? " and the homepage banner" : ""}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
