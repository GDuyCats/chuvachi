"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import {
  ALIGN,
  asAlign,
  DEFAULT_MOBILE_POINT,
  DEFAULT_POINT,
  focusStyle,
  pointOf,
  pointStyle,
  PRESETS,
  shadeAt,
  type TextAlign,
  type TextPoint,
} from "@/lib/hero-layout";
import { useAdminI18n } from "./AdminI18n";

export type BannerLook = {
  imageOnly: boolean;
  textOverlay: boolean;
  textX: number;
  textY: number;
  textXMobile: number | null;
  textYMobile: number | null;
  textAlign: string;
  focusX: number;
  focusY: number;
  imagePadding: number; // 0-12, dark frame around a full-width photo
  imageWidth: number; // 30-70 %, photo beside the texts (computers)
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
  const [photoWidth, setPhotoWidth] = useState<number | null>(null); // real width of the uploaded photo, in pixels
  const fullWidth = look.imageOnly || look.textOverlay;
  // A photo stretched over a whole wide screen needs many pixels to stay sharp.
  const tooSmall = photoWidth !== null && photoWidth < (fullWidth ? 2000 : 1200);
  const desktopPoint = pointOf(look.textX, look.textY, DEFAULT_POINT);
  const mobileAuto = look.textXMobile === null || look.textYMobile === null;
  const mobilePoint = pointOf(look.textXMobile, look.textYMobile, DEFAULT_MOBILE_POINT);
  const align = asAlign(look.textAlign);

  function setPoint(target: "desktop" | "mobile", point: TextPoint) {
    if (target === "desktop") onChange({ textX: point.x, textY: point.y });
    else onChange({ textXMobile: point.x, textYMobile: point.y });
  }

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
          <PositionGrid label={d.desktopPosition} value={desktopPoint} onPick={(point) => setPoint("desktop", point)} />
          <div className="flex flex-col gap-2">
            <PositionGrid
              label={d.mobilePosition}
              value={mobileAuto ? null : mobilePoint}
              onPick={(point) => setPoint("mobile", point)}
            />
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={mobileAuto}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? { textXMobile: null, textYMobile: null }
                      : { textXMobile: DEFAULT_MOBILE_POINT.x, textYMobile: DEFAULT_MOBILE_POINT.y },
                  )
                }
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {fullWidth ? (
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              {d.frame}: {look.imagePadding === 0 ? d.frameNone : look.imagePadding}
              <input
                type="range"
                min={0}
                max={12}
                value={look.imagePadding}
                onChange={(e) => onChange({ imagePadding: Number(e.target.value) })}
                className="accent-black"
              />
              <span className="text-xs font-normal text-muted">{d.frameHint}</span>
            </label>
          ) : (
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              {d.width}: {look.imageWidth}%
              <input
                type="range"
                min={30}
                max={70}
                step={5}
                value={look.imageWidth}
                onChange={(e) => onChange({ imageWidth: Number(e.target.value) })}
                className="accent-black"
              />
              <span className="text-xs font-normal text-muted">{d.widthHint}</span>
            </label>
          )}
        </div>
      )}

      {imageUrl && tooSmall && (
        <p className="border-[1.5px] border-black bg-white px-3 py-2 text-sm font-semibold">
          {d.tooSmall.replace("{width}", String(photoWidth)).replace("{need}", fullWidth ? "2000" : "1200")}
        </p>
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
            <img
              src={imageUrl}
              alt=""
              className="block w-full"
              onLoad={(e) => setPhotoWidth(e.currentTarget.naturalWidth)}
            />
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
          point={screen === "desktop" ? desktopPoint : mobilePoint}
          align={align}
          ctaFallback={d.ctaFallback}
          onMove={look.textOverlay ? (point) => setPoint(screen, point) : undefined}
        />
        <span className="text-xs text-muted">{look.textOverlay && imageUrl ? `${d.dragHint} ${d.previewNote}` : d.previewNote}</span>
      </div>
    </div>
  );
}

function PositionGrid({ label, value, onPick }: { label: string; value: TextPoint | null; onPick: (point: TextPoint) => void }) {
  const { t } = useAdminI18n();
  const names = t.home.designer.positions as Record<string, string>;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold">{label}</span>
      <div className="grid w-32 grid-cols-3 gap-1" role="radiogroup" aria-label={label}>
        {PRESETS.map(({ key, point }) => {
          const on = value !== null && value.x === point.x && value.y === point.y;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={names[key]}
              title={names[key]}
              onClick={() => onPick(point)}
              className={`flex h-9 items-center justify-center border-[1.5px] ${on ? "border-black bg-black" : "border-[#bdbdbd] bg-white hover:border-black"}`}
            >
              <span className={`block h-1.5 w-4 ${on ? "bg-white" : "bg-[#bdbdbd]"}`} />
            </button>
          );
        })}
      </div>
      {value && !PRESETS.some(({ point }) => point.x === value.x && point.y === value.y) && (
        <span className="text-xs text-muted">{t.home.designer.custom.replace("{x}", String(value.x)).replace("{y}", String(value.y))}</span>
      )}
    </div>
  );
}

// Real sizes of the homepage banner the preview is drawn at, then shrunk to fit the admin page.
const SCREENS = {
  desktop: { width: 1440, height: 560, imageOnlyHeight: 617 }, // 21:9 for a photo-only banner
  mobile: { width: 390, height: 480, imageOnlyHeight: 292 }, // 4:3
} as const;

// A copy of the banner at its real size (computer or phone), scaled down to fit. With "text on the
// photo", clicking or dragging on it moves the texts.
function Preview({
  screen,
  look,
  imageUrl,
  texts,
  point,
  align,
  ctaFallback,
  onMove,
}: {
  screen: "desktop" | "mobile";
  look: BannerLook;
  imageUrl: string | null;
  texts: Texts;
  point: TextPoint;
  align: TextAlign;
  ctaFallback: string;
  onMove?: (point: TextPoint) => void;
}) {
  const phone = screen === "mobile";
  const size = SCREENS[screen];
  const outer = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [boxWidth, setBoxWidth] = useState(0);

  // Follow the width available in the admin page.
  useEffect(() => {
    const element = outer.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const shownWidth = phone ? Math.min(boxWidth, 320) : boxWidth;
  const scale = shownWidth > 0 ? shownWidth / size.width : 0;
  const height = look.imageOnly && imageUrl ? size.imageOnlyHeight : phone && !look.textOverlay ? 760 : size.height;
  const inset = look.imagePadding * (phone ? 4 : 8); // same frame as the real banner
  const focus = focusStyle(look.focusX, look.focusY);

  const photo = imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- preview
    <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" style={focus} draggable={false} />
  ) : null;
  const framedPhoto = imageUrl ? (
    <div className="absolute overflow-hidden" style={{ inset }}>
      {photo}
    </div>
  ) : null;

  const textBlock = (className: string, style?: CSSProperties) => (
    <div className={`flex flex-col gap-4 ${className}`} style={style}>
      {texts.eyebrow && <span className="text-[13px] font-bold uppercase tracking-[0.16em]">{texts.eyebrow}</span>}
      <span className={`font-display uppercase leading-[1.05] ${phone ? "text-5xl" : "text-7xl"}`}>{texts.title || "—"}</span>
      {texts.subtitle && <span className={`font-semibold ${phone ? "text-[15px]" : "text-[17px]"}`}>{texts.subtitle}</span>}
      <span className="mt-2 bg-white px-10 py-3.5 text-[15px] font-bold text-black">{texts.cta || ctaFallback}</span>
    </div>
  );

  function move(event: PointerEvent<HTMLDivElement>) {
    if (!onMove || !area.current) return;
    const box = area.current.getBoundingClientRect();
    const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)));
    onMove({ x: clamp(((event.clientX - box.left) / box.width) * 100), y: clamp(((event.clientY - box.top) / box.height) * 100) });
  }

  let content: ReactNode;
  if (look.imageOnly && imageUrl) {
    content = framedPhoto;
  } else if (look.textOverlay && imageUrl) {
    // Same free area as the real banner: inside the frame, clear of the edges and slide buttons.
    const free = phone
      ? { top: inset + 40, bottom: inset + 40, left: inset + 16, right: inset + 16 }
      : { top: inset + 56, bottom: inset + 96, left: inset + 56, right: inset + 56 };
    content = (
      <div
        className={`absolute inset-0 touch-none select-none ${onMove ? "cursor-move" : ""}`}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          move(event);
        }}
        onPointerMove={(event) => {
          if (dragging.current) move(event);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
      >
        {framedPhoto}
        <div className="absolute" style={{ inset, background: shadeAt(point) }} aria-hidden="true" />
        <div ref={area} className="absolute" style={free}>
          {textBlock(`absolute w-max max-w-[min(36rem,100%)] [text-shadow:0_1px_12px_rgba(0,0,0,0.35)] ${ALIGN[align]}`, pointStyle(point))}
          {onMove && (
            <span
              className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-black"
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              aria-hidden="true"
            />
          )}
        </div>
      </div>
    );
  } else {
    // Text on the dark background, photo beside it (computer) or under it (phone).
    content = (
      <div className={`absolute inset-0 flex gap-8 ${phone ? "flex-col px-4 py-12" : "items-center px-14 py-20"}`}>
        <div className="flex max-w-xl flex-1 flex-col">{textBlock("relative items-start text-left")}</div>
        {imageUrl && (
          <div
            className={`relative overflow-hidden ${phone ? "aspect-[4/3] w-full" : "aspect-[16/11] flex-none"}`}
            style={phone ? undefined : { flexBasis: `${look.imageWidth}%` }}
          >
            {photo}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={outer} className="w-full">
      <div className="mx-auto overflow-hidden" style={{ width: shownWidth, height: height * scale }}>
        <div
          className="relative overflow-hidden bg-[#141414] text-white"
          style={{ width: size.width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}
        >
          {content}
        </div>
      </div>
    </div>
  );
}
