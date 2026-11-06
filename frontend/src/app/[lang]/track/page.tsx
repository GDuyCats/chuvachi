import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TrackOrder } from "@/components/order/TrackOrder";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

export const metadata: Metadata = {
  robots: { index: false },
};

export default async function TrackPage({ params }: PageProps<"/[lang]/track">) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    notFound();
  }
  const dict = await getDictionary(lang);

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 pb-20 pt-10 md:px-10 md:pt-16">
      <div className="flex flex-col gap-2.5">
        <h1 className="font-display text-5xl uppercase leading-none md:text-7xl">{dict.track.title}</h1>
        <p className="text-[#333333]">{dict.track.intro}</p>
      </div>
      {/* The form reads ?code=... from the URL, so it renders inside a Suspense boundary. */}
      <Suspense>
        <TrackOrder lang={lang} labels={dict.track} />
      </Suspense>
    </section>
  );
}
