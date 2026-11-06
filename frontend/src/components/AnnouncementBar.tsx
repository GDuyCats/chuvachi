import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";

type Props = {
  lang: Locale;
  dict: Dictionary["announcement"];
};

export function AnnouncementBar({ lang, dict }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 bg-black px-4 py-2.5 text-[13px] text-white md:px-6">
      <span className="hidden font-semibold uppercase tracking-wide md:inline">{dict.left}</span>
      <p className="mx-auto flex flex-wrap items-center justify-center gap-x-3 text-center font-semibold md:mx-0">
        <span>{dict.center}</span>
        <Link href={`/${lang}/menu`} className="whitespace-nowrap underline">
          {dict.centerLink}
        </Link>
      </p>
      <span className="hidden font-semibold uppercase tracking-wide md:inline">{dict.right}</span>
    </div>
  );
}
