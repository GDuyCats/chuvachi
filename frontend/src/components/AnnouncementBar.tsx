import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { HomeContent } from "@/lib/api";

type Props = {
  lang: Locale;
  content: HomeContent["announcement"];
  linkLabel: string;
};

// Thin black bar above every page. Texts come from the admin "Homepage" page.
export function AnnouncementBar({ lang, content, linkLabel }: Props) {
  if (!content || (!content.left && !content.center && !content.right)) {
    return null;
  }
  const href = content.productSlug ? `/${lang}/menu/${content.productSlug}` : `/${lang}/menu`;

  return (
    <div className="flex items-center justify-between gap-3 bg-black px-4 py-2.5 text-[13px] text-white md:px-6">
      <span className="hidden font-semibold uppercase tracking-wide md:inline">{content.left}</span>
      {content.center && (
        <p className="mx-auto flex flex-wrap items-center justify-center gap-x-3 text-center font-semibold md:mx-0">
          <span>{content.center}</span>
          <Link href={href} className="whitespace-nowrap underline">
            {linkLabel}
          </Link>
        </p>
      )}
      <span className="hidden font-semibold uppercase tracking-wide md:inline">{content.right}</span>
    </div>
  );
}
