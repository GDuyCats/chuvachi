import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MyOrders } from "@/components/order/MyOrders";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

export const metadata: Metadata = {
  robots: { index: false },
};

export default async function MyOrdersPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <section className="mx-auto w-full max-w-3xl px-4 pb-20 pt-10 md:px-10 md:pt-16">
      <MyOrders
        lang={lang}
        labels={dict.myOrders}
        accountLabels={dict.account}
        statusLabels={dict.track.steps}
        cancelReasons={dict.cancelReasons}
      />
    </section>
  );
}
