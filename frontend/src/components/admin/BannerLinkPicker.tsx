"use client";

import { useState } from "react";
import { useAdminI18n } from "./AdminI18n";

type ProductChoice = { id: number; nameVi: string; nameEn: string; isActive: boolean };

// Turns a pasted link to this site ("https://chuvachi.com/vi/news/opening") into "/news/opening".
export function normalizeBannerLink(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    const ownSite = url.hostname === window.location.hostname || url.hostname.replace(/^www\./, "") === "chuvachi.com";
    if (!ownSite) return url.protocol === "https:" ? url.href : text;
    const path = `${url.pathname}${url.search}${url.hash}`.replace(/^\/(vi|en)(?=\/|$|\?|#)/, "");
    return path.startsWith("/") ? path : `/${path}`;
  } catch {
    const path = text.replace(/^\/(vi|en)(?=\/|$|\?|#)/, "");
    return path.startsWith("/") ? path : `/${path}`;
  }
}

// Where a banner button (or a photo-only banner) goes: the whole menu, one cake, the News page,
// or any other page / link.
export function BannerLinkPicker({
  label,
  productId,
  linkUrl,
  products,
  invalid,
  onChange,
}: {
  label: string;
  productId: number | null;
  linkUrl: string | null;
  products: ProductChoice[];
  invalid: boolean;
  onChange: (value: { productId: number | null; linkUrl: string | null }) => void;
}) {
  const { t, lang } = useAdminI18n();
  const l = t.home.link;
  const initialMode = linkUrl === "/news" ? "news" : linkUrl ? "custom" : productId ? `p:${productId}` : "menu";
  const [mode, setMode] = useState(initialMode);
  const [custom, setCustom] = useState(linkUrl && linkUrl !== "/news" ? linkUrl : "");
  const input = `h-11 w-full border-[1.5px] bg-white px-3 text-[15px] font-normal ${
    invalid ? "border-black bg-[#fff6f6] outline outline-2 outline-offset-1 outline-black" : "border-black"
  }`;

  function choose(next: string) {
    setMode(next);
    if (next === "menu") onChange({ productId: null, linkUrl: null });
    else if (next === "news") onChange({ productId: null, linkUrl: "/news" });
    else if (next === "custom") onChange({ productId: null, linkUrl: normalizeBannerLink(custom) });
    else onChange({ productId: Number(next.slice(2)), linkUrl: null });
  }

  return (
    <div className="flex flex-col gap-2 md:max-w-xl">
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        {label}
        <select value={mode} onChange={(e) => choose(e.target.value)} className={input}>
          <option value="menu">{t.home.linkToMenu}</option>
          <option value="news">{l.news}</option>
          <option value="custom">{l.custom}</option>
          <optgroup label={l.cakes}>
            {products.map((product) => (
              <option key={product.id} value={`p:${product.id}`}>
                {lang === "vi" ? product.nameVi : product.nameEn}
                {product.isActive ? "" : ` (${t.home.hiddenProduct})`}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      {mode === "custom" && (
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {l.customLabel}
          <input
            value={custom}
            placeholder="/news/khai-truong"
            onChange={(e) => {
              setCustom(e.target.value);
              onChange({ productId: null, linkUrl: normalizeBannerLink(e.target.value) });
            }}
            className={input}
          />
          <span className="text-xs font-normal text-muted">{l.customHint}</span>
        </label>
      )}
    </div>
  );
}
