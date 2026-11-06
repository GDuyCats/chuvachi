import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/legal/LegalPage";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getShopInfo } from "@/lib/api";

export async function generateMetadata({ params }: PageProps<"/[lang]/policies">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return { title: `${dict.legal.policiesTitle} — Chuvachi` };
}

export default async function PoliciesPage({ params }: PageProps<"/[lang]/policies">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const [dict, shop] = await Promise.all([getDictionary(lang), getShopInfo()]);
  return <LegalPage kind="policies" lang={lang} labels={dict.legal} shop={shop} />;
}
