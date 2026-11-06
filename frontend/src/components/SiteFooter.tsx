import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { shopConfig } from "@/lib/shop-config";

type Props = {
  lang: Locale;
  dict: Dictionary["footer"];
};

// Shows a link when the URL is set, otherwise a "coming soon" note.
function ExternalItem({ label, url, fallback }: { label: string; url: string; fallback: string }) {
  if (!url) {
    return (
      <span className="text-[#c7c7c7]">
        {label}: {fallback}
      </span>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#c7c7c7] underline hover:text-white">
      {label}
    </a>
  );
}

export function SiteFooter({ lang, dict }: Props) {
  return (
    <footer id="contact" className="mt-auto flex flex-col gap-10 bg-black px-4 pb-8 pt-14 text-white md:px-10">
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3">
          <span className="font-display text-[34px] tracking-[0.18em]">CHUVACHI</span>
          <p className="text-sm text-[#c7c7c7]">{dict.tagline}</p>
        </div>

        <div className="flex flex-col gap-2.5 text-sm">
          <h2 className="font-bold uppercase tracking-widest">{dict.orderTitle}</h2>
          <ExternalItem label={dict.messenger} url={shopConfig.messengerUrl} fallback={dict.comingSoon} />
          <span className="text-[#c7c7c7]">
            {dict.phone}: {shopConfig.phone || dict.comingSoon}
          </span>
          <span className="text-[#c7c7c7]">{dict.leadTime}</span>
        </div>

        <div className="flex flex-col gap-2.5 text-sm">
          <h2 className="font-bold uppercase tracking-widest">{dict.hoursTitle}</h2>
          <span className="text-[#c7c7c7]">{shopConfig.openingHours || dict.comingSoon}</span>
          <span className="text-[#c7c7c7]">{dict.delivery}</span>
        </div>

        <div className="flex flex-col gap-2.5 text-sm">
          <h2 className="font-bold uppercase tracking-widest">{dict.followTitle}</h2>
          <ExternalItem label="Facebook" url={shopConfig.facebookUrl} fallback={dict.comingSoon} />
          <ExternalItem label="Instagram" url={shopConfig.instagramUrl} fallback={dict.comingSoon} />
          <ExternalItem label="TikTok" url={shopConfig.tiktokUrl} fallback={dict.comingSoon} />
        </div>
      </div>

      <div className="flex flex-wrap justify-between gap-3 border-t border-[#3a3a3a] pt-5 text-[13px] text-[#a3a3a3]">
        <span>
          © Chuvachi. {dict.rights}
        </span>
        <div className="flex flex-wrap gap-5">
          <Link href={`/${lang}/track`} className="text-[#c7c7c7] hover:text-white">
            {dict.trackOrder}
          </Link>
          <Link href={`/${lang}/policies`} className="text-[#c7c7c7] hover:text-white">
            {dict.policies}
          </Link>
        </div>
      </div>
    </footer>
  );
}
