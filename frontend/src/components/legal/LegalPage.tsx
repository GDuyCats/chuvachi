import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import type { ShopInfo } from "@/lib/api";
import { getLegalDoc, POLICY_UPDATED, type LegalKind } from "@/content/legal-docs";

type Props = {
  kind: LegalKind;
  lang: Locale;
  labels: Dictionary["legal"];
  shop: ShopInfo;
};

function formatFullDate(date: string, lang: Locale): string {
  return new Intl.DateTimeFormat(lang === "vi" ? "vi-VN" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

// Fills {placeholders} in the policy text with the shop's real details from the admin Settings page.
function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

// One policy page: title, date, table of contents and the sections.
export async function LegalPage({ kind, lang, labels, shop }: Props) {
  const doc = await getLegalDoc(kind, lang);
  const missing = labels.missing;

  const contactParts = [
    shop.phone ? `${labels.phone} ${shop.phone}` : null,
    shop.contactEmail ? `${labels.email} ${shop.contactEmail}` : null,
    shop.messengerUrl ? labels.messenger : null,
  ].filter((part): part is string => part !== null);

  const values: Record<string, string> = {
    shopName: shop.legalName ?? "Chuvachi",
    legalName: shop.legalName ?? missing,
    registration: shop.registrationNumber ?? missing,
    address: shop.legalAddress ?? missing,
    contactLine: contactParts.length > 0 ? contactParts.join(", ") : missing,
    retentionMonths: String(shop.dataRetentionMonths),
    unpaidMinutes: String(shop.unpaidCancelMinutes),
    smallLead: String(shop.smallOrderLeadHours),
    largeLead: String(shop.largeOrderLeadHours),
    largeThreshold: String(shop.largeOrderThreshold),
  };

  const other: LegalKind = kind === "policies" ? "privacy" : "policies";

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pb-20 pt-10 md:px-10 md:pt-16">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-4xl uppercase leading-[1.05] md:text-6xl">{doc.title}</h1>
        <p className="text-sm text-muted">{labels.updated.replace("{date}", formatFullDate(POLICY_UPDATED, lang))}</p>
        <p className="text-[17px] leading-relaxed text-[#333333]">{fill(doc.intro, values)}</p>
      </header>

      <nav aria-label={labels.onThisPage} className="flex flex-col gap-2 border-y border-line py-5">
        <span className="text-xs font-bold uppercase tracking-widest text-muted">{labels.onThisPage}</span>
        <ol className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-2">
          {doc.sections.map((section, index) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="underline-offset-4 hover:underline">
                {index + 1}. {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {doc.sections.map((section, index) => (
        <section key={section.id} id={section.id} className="flex scroll-mt-6 flex-col gap-3">
          <h2 className="font-display text-2xl uppercase tracking-wide md:text-[28px]">
            {index + 1}. {section.title}
          </h2>
          {section.blocks.map((block, blockIndex) =>
            "p" in block ? (
              <p key={blockIndex} className="leading-relaxed text-[#333333]">
                {fill(block.p, values)}
              </p>
            ) : (
              <ul key={blockIndex} className="flex list-disc flex-col gap-1.5 pl-5 leading-relaxed text-[#333333] marker:text-black">
                {block.list.map((item) => (
                  <li key={item}>{fill(item, values)}</li>
                ))}
              </ul>
            ),
          )}
        </section>
      ))}

      <p className="border-t border-line pt-6 text-[15px]">
        {labels.seeAlso}{" "}
        <Link href={`/${lang}/${other}`} className="font-semibold underline">
          {other === "privacy" ? labels.privacyTitle : labels.policiesTitle}
        </Link>
      </p>
    </article>
  );
}
