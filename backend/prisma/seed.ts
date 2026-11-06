// Sample data for development. Safe to run many times (uses upsert).
// Prices are placeholders in VND - change them to the real prices later.
//
// Pricing rule used by the shop:
//   unit price = (basePrice + FLAVOR priceDelta) * PACKAGE portions + PACKAGE priceDelta
// A negative PACKAGE priceDelta works as a box discount.

import { PrismaClient, OptionType } from "@prisma/client";

const prisma = new PrismaClient();

type SeedOption = {
  type: OptionType;
  nameVi: string;
  nameEn: string;
  priceDelta?: number;
  portions?: number;
};

type SeedProduct = {
  slug: string;
  categorySlug: string;
  nameVi: string;
  nameEn: string;
  descriptionVi: string;
  descriptionEn: string;
  basePrice: number;
  options: SeedOption[];
};

const categories = [
  { slug: "panna-cotta", nameVi: "Panna cotta", nameEn: "Panna cotta", sortOrder: 1 },
  { slug: "tiramisu", nameVi: "Tiramisu", nameEn: "Tiramisu", sortOrder: 2 },
  { slug: "mousse", nameVi: "Mousse", nameEn: "Mousse", sortOrder: 3 },
  { slug: "brownie", nameVi: "Brownie", nameEn: "Brownie", sortOrder: 4 },
];

const packageOptions: SeedOption[] = [
  { type: OptionType.PACKAGE, nameVi: "1 phần", nameEn: "Single", portions: 1 },
  { type: OptionType.PACKAGE, nameVi: "Hộp 4", nameEn: "Box of 4", portions: 4, priceDelta: -10000 },
  { type: OptionType.PACKAGE, nameVi: "Hộp 6", nameEn: "Box of 6", portions: 6, priceDelta: -20000 },
];

const products: SeedProduct[] = [
  {
    slug: "panna-cotta",
    categorySlug: "panna-cotta",
    nameVi: "Panna cotta",
    nameEn: "Panna cotta",
    descriptionVi: "Kem sữa mềm mịn, phủ sốt trái cây.",
    descriptionEn: "Silky cream pudding topped with fruit sauce.",
    basePrice: 35000,
    options: [
      { type: OptionType.FLAVOR, nameVi: "Xoài", nameEn: "Mango" },
      { type: OptionType.FLAVOR, nameVi: "Dâu", nameEn: "Strawberry" },
      { type: OptionType.FLAVOR, nameVi: "Chanh dây", nameEn: "Passion fruit" },
      ...packageOptions,
    ],
  },
  {
    slug: "tiramisu",
    categorySlug: "tiramisu",
    nameVi: "Tiramisu",
    nameEn: "Tiramisu",
    descriptionVi: "Bánh tiramisu cổ điển với cà phê và mascarpone.",
    descriptionEn: "Classic tiramisu with coffee and mascarpone.",
    basePrice: 55000,
    options: [
      { type: OptionType.FLAVOR, nameVi: "Cổ điển", nameEn: "Classic" },
      { type: OptionType.FLAVOR, nameVi: "Matcha", nameEn: "Matcha", priceDelta: 5000 },
      ...packageOptions,
    ],
  },
  {
    slug: "mousse",
    categorySlug: "mousse",
    nameVi: "Mousse",
    nameEn: "Mousse",
    descriptionVi: "Mousse nhẹ, mát, tan ngay trong miệng.",
    descriptionEn: "Light, airy mousse that melts in your mouth.",
    basePrice: 45000,
    options: [
      { type: OptionType.FLAVOR, nameVi: "Chanh dây", nameEn: "Passion fruit" },
      { type: OptionType.FLAVOR, nameVi: "Dâu", nameEn: "Strawberry" },
      { type: OptionType.FLAVOR, nameVi: "Sô-cô-la", nameEn: "Chocolate" },
      ...packageOptions,
    ],
  },
  {
    slug: "brownie",
    categorySlug: "brownie",
    nameVi: "Brownie",
    nameEn: "Brownie",
    descriptionVi: "Brownie sô-cô-la đậm vị, mềm ẩm.",
    descriptionEn: "Rich, fudgy chocolate brownie.",
    basePrice: 30000,
    options: [
      { type: OptionType.FLAVOR, nameVi: "Truyền thống", nameEn: "Original" },
      { type: OptionType.FLAVOR, nameVi: "Hạt óc chó", nameEn: "Walnut", priceDelta: 5000 },
      ...packageOptions,
    ],
  },
];

async function main(): Promise<void> {
  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: category,
      create: category,
    });
  }

  for (const [index, item] of products.entries()) {
    const category = await prisma.category.findUniqueOrThrow({
      where: { slug: item.categorySlug },
    });

    const productData = {
      nameVi: item.nameVi,
      nameEn: item.nameEn,
      descriptionVi: item.descriptionVi,
      descriptionEn: item.descriptionEn,
      basePrice: item.basePrice,
      sortOrder: index + 1,
      categoryId: category.id,
    };

    const product = await prisma.product.upsert({
      where: { slug: item.slug },
      update: productData,
      create: { slug: item.slug, ...productData },
    });

    // Replace the options so re-running the seed does not create duplicates.
    await prisma.productOption.deleteMany({ where: { productId: product.id } });
    await prisma.productOption.createMany({
      data: item.options.map((option, optionIndex) => ({
        productId: product.id,
        type: option.type,
        nameVi: option.nameVi,
        nameEn: option.nameEn,
        priceDelta: option.priceDelta ?? 0,
        portions: option.portions ?? 1,
        sortOrder: optionIndex + 1,
      })),
    });
  }

  console.log("Seed data created.");
}

main()
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
