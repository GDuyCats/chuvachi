"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";
import { SystemMessage } from "@/components/SystemMessage";
import texts from "@/i18n/dictionaries/errors.json";

// Shown when a shop page crashes. The header and footer stay, so visitors can move on.
export default function ShopError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams<{ lang?: string }>();
  const lang = params.lang === "en" ? "en" : "vi";
  const t = texts[lang];

  useEffect(() => {
    // Only the short reference code; the details stay in the server logs.
    console.error("Page error", error.digest ?? "");
  }, [error]);

  return (
    <SystemMessage code="!" title={t.errorTitle} body={t.errorBody} links={[{ href: `/${lang}`, label: t.toHome }]}>
      <button type="button" onClick={reset} className="min-h-12 bg-black px-8 font-bold text-white hover:bg-[#333333]">
        {t.retry}
      </button>
    </SystemMessage>
  );
}
