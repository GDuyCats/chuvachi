import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountView } from "@/components/account/AccountView";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

export const metadata: Metadata = {
  robots: { index: false },
};

export default async function AccountPage({ params }: PageProps<"/[lang]/account">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <section className="mx-auto w-full max-w-3xl px-4 pb-20 pt-10 md:px-10 md:pt-16">
      <AccountView lang={lang} labels={dict.account} statusLabels={dict.track.steps} cancelReasons={dict.cancelReasons} />
    </section>
  );
}
