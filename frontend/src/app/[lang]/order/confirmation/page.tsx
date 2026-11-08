import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmationView } from "@/components/order/ConfirmationView";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

export const metadata: Metadata = {
  robots: { index: false },
};

export default async function ConfirmationPage({ params }: PageProps<"/[lang]/order/confirmation">) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    notFound();
  }
  const dict = await getDictionary(lang);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 md:px-10 md:pt-16">
      <ConfirmationView lang={lang} labels={dict.thanks} pushLabels={dict.push} />
    </section>
  );
}
