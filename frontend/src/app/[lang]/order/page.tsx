import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckoutForm, type CatalogProduct } from "@/components/order/CheckoutForm";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getProducts } from "@/lib/api";

export const metadata: Metadata = {
  // Checkout pages shouldn't show up in search results.
  robots: { index: false },
};

export default async function OrderPage({ params }: PageProps<"/[lang]/order">) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    notFound();
  }
  const [dict, products] = await Promise.all([getDictionary(lang), getProducts(lang)]);

  // Only what the cart needs to show names and prices.
  const catalog: CatalogProduct[] = products.map((product) => ({
    slug: product.slug,
    name: product.name,
    imageUrl: product.imageUrl,
    basePrice: product.basePrice,
    options: product.options,
  }));

  return (
    <section className="flex flex-col gap-7 px-4 pb-20 pt-8 md:px-10 md:pt-12">
      <div className="flex flex-col gap-2">
        <Link href={`/${lang}/menu`} className="self-start py-1 text-sm font-semibold">
          {dict.order.keepBrowsing}
        </Link>
        <h1 className="font-display text-5xl uppercase leading-none md:text-7xl">{dict.order.title}</h1>
        <p className="max-w-2xl text-[15px] text-[#333333]">{dict.order.noAccount}</p>
      </div>
      <CheckoutForm lang={lang} catalog={catalog} labels={dict.order} photoComingSoon={dict.product.photoComingSoon} />
    </section>
  );
}
