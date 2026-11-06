import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MenuGrid, type MenuItem } from "@/components/menu/MenuGrid";
import { ProductGridSkeleton } from "@/components/Skeleton";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getProducts, type Product } from "@/lib/api";

// The "from" price shown on a card: one portion of the cheapest flavor.
function startingPrice(product: Product): number {
  const flavorExtras = product.options.filter((o) => o.type === "FLAVOR").map((o) => o.priceDelta);
  const cheapestExtra = flavorExtras.length > 0 ? Math.min(...flavorExtras) : 0;
  return product.basePrice + cheapestExtra;
}

export default async function MenuPage({ params }: PageProps<"/[lang]/menu">) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    notFound();
  }
  const [dict, products] = await Promise.all([getDictionary(lang), getProducts(lang)]);

  const items: MenuItem[] = products.map((product) => ({
    slug: product.slug,
    name: product.name,
    price: startingPrice(product),
    isNew: product.isNew,
    imageUrl: product.imageUrl,
    categorySlug: product.category.slug,
    categoryName: product.category.name,
  }));

  return (
    <>
      <section className="flex flex-col gap-3.5 px-4 pt-8 md:px-10 md:pt-12">
        <nav aria-label="Breadcrumb" className="flex gap-2 text-sm text-muted">
          <Link href={`/${lang}`} className="hover:text-ink">
            {dict.menu.breadcrumbHome}
          </Link>
          <span aria-hidden="true">/</span>
          <span>{dict.nav.menu}</span>
        </nav>
        <h1 className="font-display text-5xl uppercase leading-none md:text-[88px]">{dict.menu.title}</h1>
        <p className="max-w-xl text-[15px] text-[#333333] md:text-[17px]">{dict.menu.subtitle}</p>
      </section>

      {/* The filter reads the URL (?category=...), so it renders inside a Suspense boundary. */}
      <Suspense fallback={<ProductGridSkeleton label={dict.loading.menu} />}>
        <MenuGrid lang={lang} items={items} labels={dict.menu} cardLabels={dict.product} />
      </Suspense>
    </>
  );
}
