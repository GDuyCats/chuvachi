// Temporary homepage data. Later this comes from the backend
// (banners, seasons and products managed in the admin page).
// Display texts live in the dictionaries; this file only holds language-neutral data.

export const heroBanner = {
  ctaPath: "/menu/passion-fruit-mousse",
  imageUrl: null as string | null,
};

export type CategoryTile = {
  key: "new" | "panna-cotta" | "tiramisu" | "mousse" | "brownie";
  style: "black" | "white" | "grey";
};

export const categoryTiles: CategoryTile[] = [
  { key: "new", style: "black" },
  { key: "panna-cotta", style: "white" },
  { key: "tiramisu", style: "grey" },
  { key: "mousse", style: "black" },
  { key: "brownie", style: "white" },
];

export type ProductSummary = {
  slug: "panna-cotta" | "classic-tiramisu" | "matcha-tiramisu" | "passion-fruit-mousse" | "brownie";
  price: number; // starting price in VND
  isNew: boolean;
  imageUrl: string | null;
};

export const seasonalItems: ProductSummary[] = [
  { slug: "classic-tiramisu", price: 55000, isNew: false, imageUrl: null },
  { slug: "matcha-tiramisu", price: 60000, isNew: true, imageUrl: null },
  { slug: "passion-fruit-mousse", price: 45000, isNew: true, imageUrl: null },
  { slug: "panna-cotta", price: 35000, isNew: false, imageUrl: null },
  { slug: "brownie", price: 30000, isNew: false, imageUrl: null },
];
