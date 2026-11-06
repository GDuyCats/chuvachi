import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SignInPanel } from "@/components/account/SignInPanel";
import { FormSkeleton } from "@/components/Skeleton";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

export const metadata: Metadata = {
  robots: { index: false },
};

export default async function LoginPage({ params }: PageProps<"/[lang]/login">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <section className="mx-auto w-full max-w-xl px-4 pb-20 pt-10 md:pt-16">
      {/* The panel reads ?next=... from the URL, so it renders inside a Suspense boundary. */}
      <Suspense fallback={<FormSkeleton fields={2} label={dict.loading.form} />}>
        <SignInPanel lang={lang} mode="signin" labels={dict.account} />
      </Suspense>
    </section>
  );
}
