import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PhotoBox } from "@/components/PhotoBox";
import { ProductCard } from "@/components/ProductCard";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductOptions, type OptionChoice } from "@/components/product/ProductOptions";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getProduct, getProducts, getShopInfo, type Product } from "@/lib/api";

// Pre-build a page for every product in each language. New products added later
// are rendered on their first visit.
export async function generateStaticParams({ params }: { params: { lang: string } }) {
  if (!isLocale(params.lang)) return [];
  const products = await getProducts(params.lang);
  return products.map((product) => ({ slug: product.slug }));
}

async function loadProduct(lang: string, slug: string): Promise<{ locale: Locale; product: Product }> {
  if (!isLocale(lang)) notFound();
  const product = await getProduct(lang, slug);
  if (!product) notFound();
  return { locale: lang, product };
}

export async function generateMetadata({ params }: PageProps<"/[lang]/menu/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  const { product } = await loadProduct(lang, slug);
  return {
    title: `${product.name} — Chuvachi`,
    description: product.description ?? undefined,
    alternates: {
      canonical: `/${lang}/menu/${slug}`,
      languages: { vi: `/vi/menu/${slug}`, en: `/en/menu/${slug}` },
    },
    // The cake's cover photo when the link is shared on Facebook or Messenger.
    openGraph: {
      title: `${product.name} — Chuvachi`,
      description: product.description ?? undefined,
      images: product.imageUrl
        ? [{ url: product.imageUrl, alt: product.name }]
        : [{ url: "/og-default.png", width: 1200, height: 630, alt: "Chuvachi" }],
    },
  };
}

function toChoices(product: Product, type: "FLAVOR" | "PACKAGE"): OptionChoice[] {
  return product.options
    .filter((option) => option.type === type)
    .map(({ id, name, priceDelta, portions }) => ({ id, name, priceDelta, portions }));
}

export default async function ProductPage({ params }: PageProps<"/[lang]/menu/[slug]">) {
  const { lang, slug } = await params;
  const { locale, product } = await loadProduct(lang, slug);
  const [dict, allProducts, shop] = await Promise.all([getDictionary(locale), getProducts(locale), getShopInfo()]);
  const labels = dict.productDetail;

  const related = allProducts.filter((p) => p.slug !== product.slug).slice(0, 4);

  return (
    <>
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 px-4 pt-5 text-sm text-muted md:px-10">
        <Link href={`/${locale}`} className="hover:text-ink">
          {dict.menu.breadcrumbHome}
        </Link>
        <span aria-hidden="true">/</span>
        <Link href={`/${locale}/menu`} className="hover:text-ink">
          {dict.nav.menu}
        </Link>
        <span aria-hidden="true">/</span>
        <span>{product.name}</span>
      </nav>

      <section className="flex flex-col gap-8 px-4 pb-16 pt-6 md:flex-row md:items-start md:gap-14 md:px-10">
        <div className="min-w-0 md:sticky md:top-4 md:flex-1">
          <ProductGallery
            images={product.images}
            alt={product.name}
            labels={{
              photoComingSoon: dict.product.photoComingSoon,
              photoOf: labels.photoOf,
              previousPhoto: labels.previousPhoto,
              nextPhoto: labels.nextPhoto,
            }}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-6 md:flex-1">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-muted">
                {product.category.name}
              </span>
              {product.isNew && (
                <span className="bg-black px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-white">
                  {dict.product.new}
                </span>
              )}
            </div>
            <h1 className="font-display text-5xl uppercase leading-[1.05] md:text-[64px]">{product.name}</h1>
            {product.description && <p className="text-base leading-relaxed text-[#333333]">{product.description}</p>}
          </div>

          <ProductOptions
            lang={locale}
            slug={product.slug}
            basePrice={product.basePrice}
            flavors={toChoices(product, "FLAVOR")}
            packages={toChoices(product, "PACKAGE")}
            labels={labels}
          />

          {shop.messengerUrl && (
            <a
              href={shop.messengerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="self-start py-1.5 text-[15px] font-semibold underline"
            >
              {labels.messengerQuestion}
            </a>
          )}

          <div className="flex flex-col border-t border-ink">
            {product.ingredients && (
              <div className="flex flex-col gap-1.5 border-b border-[#e0e0e0] py-4">
                <h2 className="text-sm font-bold uppercase tracking-wider">{labels.ingredientsTitle}</h2>
                <p className="whitespace-pre-line text-[15px] text-[#333333]">{product.ingredients}</p>
              </div>
            )}
            {product.allergens && (
              <div className="flex flex-col gap-1.5 border-b border-[#e0e0e0] py-4">
                <h2 className="text-sm font-bold uppercase tracking-wider">{labels.allergensTitle}</h2>
                <p className="text-[15px] font-semibold text-[#333333]">{product.allergens}</p>
              </div>
            )}
            <div className="flex flex-col gap-1.5 border-b border-[#e0e0e0] py-4">
              <h2 className="text-sm font-bold uppercase tracking-wider">{labels.storageTitle}</h2>
              <p className="text-[15px] text-[#333333]">{labels.storageText}</p>
            </div>
            <div className="flex flex-col gap-1.5 border-b border-[#e0e0e0] py-4">
              <h2 className="text-sm font-bold uppercase tracking-wider">{labels.promiseTitle}</h2>
              <p className="text-[15px] leading-relaxed text-[#333333]">{labels.promiseText}</p>
              <Link href={`/${locale}/policies`} className="self-start py-1 text-sm font-semibold underline">
                {labels.readPolicies}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="flex flex-col gap-6 px-4 pb-20 md:px-10">
          <h2 className="font-display text-[32px] uppercase tracking-wide md:text-[40px]">{labels.alsoLike}</h2>
          <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto md:gap-6">
            {related.map((item) => (
              <ProductCard
                key={item.slug}
                lang={locale}
                slug={item.slug}
                name={item.name}
                price={item.basePrice}
                isNew={item.isNew}
                imageUrl={item.imageUrl}
                labels={dict.product}
                actionLabel={labels.view}
                className="w-[70%] shrink-0 snap-start sm:w-[40%] lg:w-[calc((100%-72px)/4)]"
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
