"use client";

import { useState, type MouseEvent } from "react";
import {
  ALIGN,
  asPosition,
  DEFAULT_MOBILE_POSITION,
  DEFAULT_POSITION,
  focusStyle,
  PLACE,
  shadeFor,
  TEXT_POSITIONS,
  type TextAlign,
  type TextPosition,
} from "@/lib/hero-layout";
import { useAdminI18n } from "./AdminI18n";

export type BannerLook = {
  imageOnly: boolean;
  textOverlay: boolean;
  textPosition: string;
  textPositionMobile: string | null;
  textAlign: string;
  focusX: number;
  focusY: number;
};

type Texts = { eyebrow: string | null; title: string | null; subtitle: string | null; cta: string | null };

// Text position, text alignment and the photo's main point, with a live preview
// of the banner on a computer and on a phone.
export function BannerDesigner({
  look,
  imageUrl,
  texts,
  onChange,
}: {
  look: BannerLook;
  imageUrl: string | null;
  texts: Texts;
  onChange: (next: Partial<BannerLook>) => void;
}) {
  const { t } = useAdminI18n();
  const d = t.home.designer;
  const [screen, setScreen] = useState<"desktop" | "mobile">("desktop");
  const desktopPos = asPosition(look.textPosition, DEFAULT_POSITION);
  const mobilePos = look.textPositionMobile ? asPosition(look.textPositionMobile, DEFAULT_MOBILE_POSITION) : null;
  const align: TextAlign = look.textAlign === "center" || look.textAlign === "right" ? look.textAlign : "left";

  function pickFocus(event: MouseEvent<HTMLButtonElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    onChange({
      focusX: Math.round(((event.clientX - box.left) / box.width) * 100),
      focusY: Math.round(((event.clientY - box.top) / box.height) * 100),
    });
  }

  return (
    <div className="flex flex-col gap-4 border border-[#e0e0e0] bg-[#fafafa] p-4">
      {look.textOverlay && imageUrl && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <PositionGrid
            label={d.desktopPosition}
            value={desktopPos}
            onPick={(pos) => onChange({ textPosition: pos })}
          />
          <div className="flex flex-col gap-2">
            <PositionGrid
              label={d.mobilePosition}
              value={mobilePos}
              onPick={(pos) => onChange({ textPositionMobile: pos })}
            />
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={mobilePos === null}
                onChange={(e) => onChange({ textPositionMobile: e.target.checked ? null : DEFAULT_MOBILE_POSITION })}
                className="h-4 w-4 accent-black"
              />
              {d.mobileAuto}
            </label>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">{d.align}</span>
            <div className="flex">
              {(["left", "center", "right"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChange({ textAlign: value })}
                  aria-pressed={align === value}
                  className={`min-h-10 flex-1 border-[1.5px] border-black px-2 text-xs font-bold [&+&]:-ml-[1.5px] ${align === value ? "bg-black text-white" : "bg-white"}`}
                >
                  {d.alignNames[value]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {imageUrl && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">{d.focus}</span>
          <span className="text-xs text-muted">{d.focusHint}</span>
          <button
            type="button"
            onClick={pickFocus}
            aria-label={d.focus}
            className="relative w-full max-w-xs cursor-crosshair self-start border border-[#d4d4d4] bg-white"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- whole photo to pick the main point */}
            <img src={imageUrl} alt="" className="block w-full" />
            <span
              className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-black shadow"
              style={{ left: `${look.focusX}%`, top: `${look.focusY}%` }}
              aria-hidden="true"
            />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold">{d.preview}</span>
          <div className="flex">
            {(["desktop", "mobile"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setScreen(value)}
                aria-pressed={screen === value}
                className={`min-h-9 border-[1.5px] border-black px-3 text-xs font-bold [&+&]:-ml-[1.5px] ${screen === value ? "bg-black text-white" : "bg-white"}`}
              >
                {value === "desktop" ? d.desktop : d.mobile}
              </button>
            ))}
          </div>
        </div>
        <Preview
          screen={screen}
          look={look}
          imageUrl={imageUrl}
          texts={texts}
          position={screen === "desktop" ? desktopPos : (mobilePos ?? DEFAULT_MOBILE_POSITION)}
          align={align}
          ctaFallback={d.ctaFallback}
        />
        <span className="text-xs text-muted">{d.previewNote}</span>
      </div>
    </div>
  );
}

function PositionGrid({ label, value, onPick }: { label: string; value: TextPosition | null; onPick: (pos: TextPosition) => void }) {
  const { t } = useAdminI18n();
  const names = t.home.designer.positions as Record<string, string>;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold">{label}</span>
      <div className="grid w-32 grid-cols-3 gap-1" role="radiogroup" aria-label={label}>
        {TEXT_POSITIONS.map((pos) => (
          <button
            key={pos}
            type="button"
            role="radio"
            aria-checked={value === pos}
            aria-label={names[pos]}
            title={names[pos]}
            onClick={() => onPick(pos)}
            className={`flex h-9 items-center justify-center border-[1.5px] ${value === pos ? "border-black bg-black" : "border-[#bdbdbd] bg-white hover:border-black"}`}
          >
            <span className={`block h-1.5 w-4 ${value === pos ? "bg-white" : "bg-[#bdbdbd]"}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

// A small copy of the banner, laid out as on a computer or a phone.
function Preview({
  screen,
  look,
  imageUrl,
  texts,
  position,
  align,
  ctaFallback,
}: {
  screen: "desktop" | "mobile";
  look: BannerLook;
  imageUrl: string | null;
  texts: Texts;
  position: TextPosition;
  align: TextAlign;
  ctaFallback: string;
}) {
  const phone = screen === "mobile";
  const frame = phone ? "mx-auto w-[300px]" : "w-full";
  const focus = focusStyle(look.focusX, look.focusY);
  const photo = imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- preview
    <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" style={focus} />
  ) : null;

  const textBlock = (alignClass: string) => (
    <div className={`relative flex max-w-[75%] flex-col gap-1.5 ${alignClass} ${phone ? "max-w-full" : ""}`}>
      {texts.eyebrow && <span className="text-[9px] font-bold uppercase tracking-[0.16em]">{texts.eyebrow}</span>}
      <span className={`font-display uppercase leading-[1.05] ${phone ? "text-2xl" : "text-3xl"}`}>{texts.title || "—"}</span>
      {texts.subtitle && <span className="text-[11px] font-semibold">{texts.subtitle}</span>}
      <span className="mt-1 bg-white px-4 py-1.5 text-[10px] font-bold text-black">{texts.cta || ctaFallback}</span>
    </div>
  );

  if (look.imageOnly && imageUrl) {
    return (
      <div className={`${frame} relative overflow-hidden bg-[#141414] ${phone ? "aspect-[4/3]" : "aspect-[21/9]"}`}>{photo}</div>
    );
  }

  if (look.textOverlay && imageUrl) {
    return (
      <div
        className={`${frame} relative flex overflow-hidden bg-[#141414] text-white ${phone ? "h-[400px] p-4" : "aspect-[21/9] p-6"} ${PLACE[position]}`}
      >
        {photo}
        <div className="absolute inset-0" style={{ background: shadeFor(position) }} aria-hidden="true" />
        {textBlock(ALIGN[align])}
      </div>
    );
  }

  // Text on the dark background, photo beside it (computer) or under it (phone).
  return (
    <div className={`${frame} flex gap-4 overflow-hidden bg-[#141414] text-white ${phone ? "flex-col p-4" : "aspect-[21/9] items-center p-6"}`}>
      <div className="flex flex-1 flex-col">{textBlock("items-start text-left")}</div>
      {imageUrl && (
        <div className={`relative flex-1 overflow-hidden ${phone ? "aspect-[4/3]" : "aspect-[16/11]"}`}>{photo}</div>
      )}
    </div>
  );
}
