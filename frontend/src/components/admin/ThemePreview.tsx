"use client";

import type { CSSProperties } from "react";
import type { AdminThemeInput } from "@/lib/admin-api";
import { DEFAULT_COLORS, type ThemeEffectKind } from "@/lib/site-theme";
import { ThemeEffect } from "../theme/ThemeEffect";
import { isThemeIcon, ThemeIconSvg } from "../theme/ThemeIcon";
import { useAdminI18n } from "./AdminI18n";

type Props = { look: AdminThemeInput; phone: boolean };

// A small mock of the shop pages in the look's colors: message bar, top bar, banner, a cake card
// and the footer, with the falling effect inside the box.
export function ThemePreview({ look, phone }: Props) {
  const { t, lang } = useAdminI18n();
  const p = t.themes.preview;
  const c = { ...DEFAULT_COLORS, ...look.colors };
  const paint = (bg: string, ink: string): CSSProperties => ({ background: bg, color: ink });
  const message = ((lang === "en" ? look.messageEn ?? look.messageVi : look.messageVi ?? look.messageEn) ?? "").split("\n")[0]?.trim();
  const kind: ThemeEffectKind = look.effect;
  const showEffect = look.effectOn && kind !== "none" && (kind !== "image" || Boolean(look.effectImageUrl));

  const icon = look.iconUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- admin preview of an uploaded icon
    <img src={look.iconUrl} alt="" className="h-5 w-5 object-contain" />
  ) : isThemeIcon(look.icon) ? (
    <ThemeIconSvg name={look.icon} size={18} />
  ) : null;

  const card = (
    <div className="flex flex-col gap-1.5">
      <div className="relative aspect-square bg-[#ececec]">
        <span className="absolute left-1.5 top-1.5 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest" style={paint(c.accent, c.accentInk)}>
          {p.new}
        </span>
      </div>
      <span className="text-[11px] font-semibold">{p.cake}</span>
      <span className="text-[10px] text-muted">65.000đ</span>
      <span className="py-1.5 text-center text-[10px] font-bold" style={paint(c.btn, c.btnInk)}>
        {p.add}
      </span>
    </div>
  );

  return (
    <div className="flex justify-center">
      <div
        className="relative overflow-hidden border-[1.5px] border-black bg-white text-ink"
        style={{ width: phone ? 300 : "100%" }}
        aria-label={t.themes.preview.title}
      >
        <div className="truncate px-3 py-1.5 text-center text-[10px] font-semibold" style={paint(c.bar, c.barInk)}>
          {message || p.defaultMessage}
          {look.linkUrl && message && <span className="ml-2 underline">{p.see}</span>}
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5" style={paint(c.head, c.headInk)}>
          <span className="flex items-center gap-1.5 font-display text-base tracking-[0.18em]">
            CHUVACHI
            {icon}
          </span>
          {!phone && (
            <span className="flex gap-4 text-[11px] font-semibold">
              <span>{p.menu}</span>
              <span>{p.news}</span>
            </span>
          )}
          <span className="relative flex h-6 w-6 items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 8h14l-1 12H6z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
              <path d="M9 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
            <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full text-[8px] font-bold" style={paint(c.accent, c.accentInk)}>
              2
            </span>
          </span>
        </div>

        <div className={`flex gap-3 px-4 py-6 ${phone ? "flex-col" : "items-center justify-between"}`} style={paint(c.hero, c.heroInk)}>
          <div className="flex flex-col gap-1.5">
            <span className="font-display text-2xl uppercase leading-none">{p.heroTitle}</span>
            <span className="text-[11px] font-semibold">{p.heroText}</span>
            <span className="mt-1 self-start px-4 py-1.5 text-[10px] font-bold" style={paint(c.heroInk, c.hero)}>
              {p.order}
            </span>
          </div>
          <div className={`bg-[#8a8a8a]/40 ${phone ? "aspect-[4/3] w-full" : "aspect-[16/11] w-2/5"}`} />
        </div>

        <div className={`grid gap-3 p-4 ${phone ? "grid-cols-2" : "grid-cols-3"}`}>
          {card}
          {card}
          {!phone && card}
        </div>

        <div className="flex flex-col gap-1 px-4 py-4" style={paint(c.foot, c.footInk)}>
          <span className="font-display text-sm tracking-[0.18em]">CHUVACHI</span>
          <span className="text-[10px] opacity-75">{p.footer}</span>
        </div>

        {showEffect && (
          <ThemeEffect
            contained
            lang={lang}
            colors={look.colors}
            effect={{
              kind,
              imageUrl: look.effectImageUrl,
              amount: look.effectAmount,
              speed: look.effectSpeed,
              size: look.effectSize,
              allPages: true,
            }}
          />
        )}
      </div>
    </div>
  );
}
