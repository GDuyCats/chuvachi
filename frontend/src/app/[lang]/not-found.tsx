"use client";

import { useParams } from "next/navigation";
import { SystemMessage } from "@/components/SystemMessage";
import texts from "@/i18n/dictionaries/errors.json";

// Shown inside the shop layout for unknown addresses and missing cakes.
// It runs without the page's language data, so it reads the language from the URL.
export default function ShopNotFound() {
  const params = useParams<{ lang?: string }>();
  const lang = params.lang === "en" ? "en" : "vi";
  const t = texts[lang];

  return (
    <SystemMessage
      code="404"
      title={t.notFoundTitle}
      body={t.notFoundBody}
      links={[
        { href: `/${lang}/menu`, label: t.toMenu, primary: true },
        { href: `/${lang}`, label: t.toHome },
      ]}
    />
  );
}
