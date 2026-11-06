import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

// Temporary homepage. The real sections (banner, menu tiles, seasonal block) come in the next step.
export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    notFound();
  }
  const dict = await getDictionary(lang);

  return (
    <section className="flex flex-col gap-4 px-4 py-20 md:px-10">
      <h1 className="font-display text-5xl leading-none md:text-7xl">{dict.home.placeholderTitle.toUpperCase()}</h1>
      <p className="max-w-xl text-base text-muted">{dict.home.placeholderText}</p>
    </section>
  );
}
