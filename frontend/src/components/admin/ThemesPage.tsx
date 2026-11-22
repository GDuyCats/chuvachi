"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  adminApi,
  AdminApiError,
  AdminValidationError,
  type AdminTheme,
  type AdminThemeInput,
  type ThemeBundle,
  type ThemePreset,
} from "@/lib/admin-api";
import {
  COLOR_PAIRS,
  contrastRatio,
  DEFAULT_COLORS,
  MAX_EFFECT_IMAGES,
  PIECE_GROUPS,
  PIECE_MOTION,
  THEME_ICONS,
  type ColorKey,
  type PieceKind,
  type ThemeColors,
} from "@/lib/site-theme";
import { PieceIcon } from "../theme/PieceIcon";
import { isThemeIcon, ThemeIconSvg } from "../theme/ThemeIcon";
import { useAdminI18n } from "./AdminI18n";
import { AdminRowsSkeleton } from "./AdminSkeletons";
import { normalizeBannerLink } from "./BannerLinkPicker";
import { SaveButton, sameData, useUnsavedGuard } from "./save-state";
import { ThemePreview } from "./ThemePreview";
import { useToast } from "./Toast";

const input = "h-11 w-full border-[1.5px] border-black bg-white px-3 text-[15px] font-normal";
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const READABLE = 4.5; // contrast ratio for comfortable reading
const QUICK_LINKS = ["/menu", "/news", "/order", "/track"] as const;
const MAX_PIECES = 12;

function toInput(theme: AdminTheme): AdminThemeInput {
  const { id: _id, sortOrder: _sortOrder, ...rest } = theme;
  return rest;
}

// A ready-made look as an editable look, to preview it before creating anything.
function presetLook(preset: ThemePreset | undefined, lang: "vi" | "en"): AdminThemeInput {
  return {
    name: preset ? (lang === "en" ? preset.nameEn : preset.nameVi) : "",
    colors: preset?.colors ?? {},
    messageVi: preset?.messageVi ?? null,
    messageEn: preset?.messageEn ?? null,
    linkUrl: preset?.linkUrl ?? null,
    icon: preset?.icon ?? null,
    iconUrl: null,
    effectOn: preset?.effectOn ?? false,
    effectPieces: preset?.effects ?? [],
    effectImages: [],
    effectAmount: preset?.effectAmount ?? 40,
    effectSpeed: preset?.effectSpeed ?? 40,
    effectSize: preset?.effectSize ?? 50,
    effectSizeMix: preset?.effectSizeMix ?? 40,
    effectAllPages: false,
    scheduleOn: false,
    startDate: preset?.startDate ?? null,
    endDate: preset?.endDate ?? null,
    yearly: preset?.yearly ?? false,
  };
}

// Same colors, whatever the order or letter case.
function sameColors(a: ThemeColors, b: ThemeColors): boolean {
  const pick = (colors: ThemeColors) =>
    COLOR_PAIRS.flatMap(({ bg, ink }) => [colors[bg]?.toLowerCase() ?? "", colors[ink]?.toLowerCase() ?? ""]).join(",");
  return pick(a) === pick(b);
}

// "2026-12-01" -> "01/12" (or "01/12/2026" for one-off dates)
function shortDate(value: string, withYear: boolean): string {
  const [year, month, day] = value.split("-");
  return withYear ? `${day}/${month}/${year}` : `${day}/${month}`;
}

// Seasonal looks: the mode switch, the list (with order) and the editor with a live preview.
export function ThemesPage() {
  const router = useRouter();
  const toast = useToast();
  const { t, lang } = useAdminI18n();
  const s = t.themes;
  const [bundle, setBundle] = useState<ThemeBundle | null>(null);
  const [failed, setFailed] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi
      .getThemes()
      .then(setBundle)
      .catch((error: unknown) => {
        if (error instanceof AdminApiError && error.status === 401) router.replace("/admin/login");
        else setFailed(true);
      });
  }, [router]);

  // Runs an action that returns the new bundle; shows errors. Returns false when it failed.
  async function run<T extends ThemeBundle>(action: () => Promise<T>, success?: string): Promise<T | null> {
    setBusy(true);
    try {
      const next = await action();
      setBundle(next);
      if (success) toast.success(success);
      return next;
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) router.replace("/admin/login");
      else if (error instanceof AdminValidationError && error.fields.includes("pinEnded")) toast.error(s.pinEnded);
      else toast.error(s.unknownError);
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (failed) return <p className="text-sm">{s.loadFailed}</p>;
  if (!bundle) return <AdminRowsSkeleton label={s.loading} />;

  // Turn a look on now (early, without waiting for its dates), or stop it.
  const pin = (id: number | null) =>
    void run(() => adminApi.themeSwitches(false, id), id === null ? s.pinOffDone : s.pinOnDone);

  const editing = editingId !== null ? bundle.themes.find((theme) => theme.id === editingId) : undefined;
  if (editing) {
    return (
      <ThemeEditor
        key={editing.id}
        theme={editing}
        presets={bundle.presets}
        settings={bundle.settings}
        busy={busy}
        onPin={pin}
        themes={bundle.themes}
        onSwitch={setEditingId}
        onBack={() => setEditingId(null)}
        onSaved={setBundle}
      />
    );
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl uppercase md:text-[40px]">{s.title}</h1>
        <p className="text-sm text-muted">{s.hint}</p>
      </div>

      <ModePanel
        bundle={bundle}
        busy={busy}
        onChange={(off, pinned) => run(() => adminApi.themeSwitches(off, pinned), t.themes.saved)}
        onDefault={(id) => run(() => adminApi.setDefaultTheme(id), t.themes.saved)}
      />

      <CreatePanel
        bundle={bundle}
        busy={busy}
        onCreate={async (preset) => {
          const next = await run(() => adminApi.createTheme(preset, lang), s.created);
          if (next) setEditingId(next.createdId);
        }}
      />

      <section className="flex flex-col gap-3">
        {bundle.themes.length === 0 ? (
          <p className="border-[1.5px] border-dashed border-[#bdbdbd] p-6 text-center text-sm text-muted">{s.empty}</p>
        ) : (
          <>
            <p className="text-xs text-muted">{s.listHint}</p>
            <ul className="flex flex-col gap-2">
              {bundle.themes.map((theme, index) => (
                <ThemeRow
                  key={theme.id}
                  theme={theme}
                  showing={bundle.activeId === theme.id}
                  pinned={bundle.settings.themePinnedId === theme.id && !bundle.settings.pinExpired}
                  isDefault={bundle.settings.themeDefaultId === theme.id}
                  onDefault={() => void run(() => adminApi.setDefaultTheme(bundle.settings.themeDefaultId === theme.id ? null : theme.id), s.saved)}
                  onPin={() => pin(bundle.settings.themePinnedId === theme.id && !bundle.settings.pinExpired ? null : theme.id)}
                  first={index === 0}
                  last={index === bundle.themes.length - 1}
                  busy={busy}
                  onEdit={() => setEditingId(theme.id)}
                  onMove={(step) => {
                    const ids = bundle.themes.map((item) => item.id);
                    const [moved] = ids.splice(index, 1);
                    ids.splice(index + step, 0, moved);
                    void run(() => adminApi.orderThemes(ids));
                  }}
                  onCopy={() => void run(() => adminApi.copyTheme(theme.id, lang), s.copied)}
                  onDelete={() => {
                    if (window.confirm(s.deleteConfirm.replace("{name}", theme.name))) {
                      void run(() => adminApi.deleteTheme(theme.id), s.deleted);
                    }
                  }}
                />
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

// What customers see now, and the one dropdown that picks: automatic / all off / one look on now.
function ModePanel({
  bundle,
  busy,
  onChange,
  onDefault,
}: {
  bundle: ThemeBundle;
  busy: boolean;
  onChange: (off: boolean, pinned: number | null) => void;
  onDefault: (id: number | null) => void;
}) {
  const { t } = useAdminI18n();
  const s = t.themes;
  const { themesOff, themePinnedId } = bundle.settings;
  const value = themesOff ? "off" : themePinnedId !== null ? `pin:${themePinnedId}` : "auto";
  const active = bundle.themes.find((theme) => theme.id === bundle.activeId);

  return (
    <section className="flex flex-col gap-3 border-[1.5px] border-black bg-white p-4 md:p-5">
      <p className="text-sm">
        {s.now}: <strong>{active ? active.name : s.nowDefault}</strong>
      </p>
      <label className="flex flex-col gap-1.5 text-sm font-semibold md:max-w-md">
        {s.mode}
        <select
          value={value}
          disabled={busy}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "off") onChange(true, null);
            else if (next === "auto") onChange(false, null);
            else onChange(false, Number(next.slice(4)));
          }}
          className={input}
        >
          <option value="auto">{s.modeAuto}</option>
          <option value="off">{s.modeOff}</option>
          {bundle.themes.map((theme) => (
            <option key={theme.id} value={`pin:${theme.id}`}>
              {s.modePin.replace("{name}", theme.name)}
            </option>
          ))}
        </select>
      </label>
      {bundle.settings.themePinnedId !== null && <PinNote settings={bundle.settings} />}
      <p className="text-xs text-muted">{s.modeHint}</p>
      <label className="flex flex-col gap-1.5 text-sm font-semibold md:max-w-md">
        {s.defaultLook}
        <select
          value={bundle.settings.themeDefaultId ?? ""}
          disabled={busy}
          onChange={(event) => onDefault(event.target.value ? Number(event.target.value) : null)}
          className={input}
        >
          <option value="">{s.defaultNone}</option>
          {bundle.themes.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted">{s.defaultHint}</p>
    </section>
  );
}

// Ready-made looks in two groups: everyday color sets, then holidays.
function PresetOptions({ presets }: { presets: ThemeBundle["presets"] }) {
  const { t, lang } = useAdminI18n();
  const s = t.themes;
  return (
    <>
      {(["everyday", "holiday"] as const).map((group) => (
        <optgroup key={group} label={group === "everyday" ? s.presetEveryday : s.presetGroup}>
          {presets
            .filter((item) => item.group === group)
            .map((item) => (
              <option key={item.key} value={item.key}>
                {lang === "en" ? item.nameEn : item.nameVi}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );
}

// When a look turned on by hand turns off by itself.
function PinNote({ settings }: { settings: ThemeBundle["settings"] }) {
  const { t } = useAdminI18n();
  const s = t.themes;
  if (settings.pinExpired) return <p className="text-sm font-semibold">{s.pinExpired}</p>;
  return (
    <p className="text-sm font-semibold">
      {settings.pinnedUntil ? s.pinnedUntil.replace("{date}", shortDate(settings.pinnedUntil, true)) : s.pinnedForever}
    </p>
  );
}

// Pick a ready-made look, see it in the preview, then create a look from it.
function CreatePanel({ bundle, busy, onCreate }: { bundle: ThemeBundle; busy: boolean; onCreate: (preset: string | null) => void }) {
  const { t, lang } = useAdminI18n();
  const s = t.themes;
  const [preset, setPreset] = useState(bundle.presets[0]?.key ?? "");
  const [phone, setPhone] = useState(false);
  const chosen = bundle.presets.find((item) => item.key === preset);

  return (
    <section className="flex flex-col gap-3 border-[1.5px] border-black bg-white p-4 md:p-5">
      <h2 className="font-bold">{s.create}</h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-semibold">
          {s.createFrom}
          <select value={preset} onChange={(event) => setPreset(event.target.value)} className={input}>
            <PresetOptions presets={bundle.presets} />
            <option value="">{s.blank}</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => onCreate(preset || null)}
          className="min-h-11 bg-black px-6 font-bold text-white disabled:opacity-50"
        >
          {s.createButton}
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-3">
          {chosen && <Swatches colors={chosen.colors} />}
          {chosen && isThemeIcon(chosen.icon) && <ThemeIconSvg name={chosen.icon} size={20} />}
          <span className="text-xs text-muted">{s.createPreviewHint}</span>
        </span>
        <PreviewModeSwitch phone={phone} onChange={setPhone} />
      </div>
      <ThemePreview look={presetLook(chosen, lang)} phone={phone} />
    </section>
  );
}

function PreviewModeSwitch({ phone, onChange }: { phone: boolean; onChange: (phone: boolean) => void }) {
  const { t } = useAdminI18n();
  const s = t.themes;
  return (
    <div className="flex">
      {[false, true].map((isPhone) => (
        <button
          key={String(isPhone)}
          type="button"
          onClick={() => onChange(isPhone)}
          aria-pressed={phone === isPhone}
          className={`min-h-10 border-[1.5px] border-black px-3 text-xs font-bold [&+&]:-ml-[1.5px] ${phone === isPhone ? "bg-black text-white" : "bg-white"}`}
        >
          {isPhone ? s.preview.phone : s.preview.desktop}
        </button>
      ))}
    </div>
  );
}

// A strip of the look's main colors.
function Swatches({ colors }: { colors: ThemeColors }) {
  const keys: ColorKey[] = ["btn", "bar", "foot", "hero", "accent"];
  return (
    <span className="flex border border-[#d4d4d4]" aria-hidden="true">
      {keys.map((key) => (
        <span key={key} className="h-6 w-6" style={{ background: colors[key] ?? DEFAULT_COLORS[key] }} />
      ))}
    </span>
  );
}

function ThemeRow({
  theme,
  showing,
  pinned,
  onPin,
  isDefault,
  onDefault,
  first,
  last,
  busy,
  onEdit,
  onMove,
  onCopy,
  onDelete,
}: {
  theme: AdminTheme;
  showing: boolean;
  pinned: boolean;
  onPin: () => void;
  isDefault: boolean;
  onDefault: () => void;
  first: boolean;
  last: boolean;
  busy: boolean;
  onEdit: () => void;
  onMove: (step: -1 | 1) => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const { t, lang } = useAdminI18n();
  const s = t.themes;
  let when: string = s.noSchedule;
  if (theme.startDate && theme.endDate) {
    const range = `${shortDate(theme.startDate, !theme.yearly)} – ${shortDate(theme.endDate, !theme.yearly)}${theme.yearly ? ` (${s.yearlyShort})` : ""}`;
    when = theme.scheduleOn ? range : `${range} · ${s.scheduleOff}`;
  } else if (!theme.scheduleOn) {
    when = s.scheduleOff;
  }
  const small = "flex h-9 w-9 items-center justify-center border-[1.5px] border-black text-sm font-bold disabled:opacity-30";

  return (
    <li className="flex flex-wrap items-center gap-3 border-[1.5px] border-black bg-white p-3">
      <div className="flex flex-col gap-1">
        <button type="button" onClick={() => onMove(-1)} disabled={busy || first} aria-label={s.moveUp} className={small}>
          ↑
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={busy || last} aria-label={s.moveDown} className={small}>
          ↓
        </button>
      </div>
      <Swatches colors={theme.colors} />
      {theme.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin preview of an uploaded icon
        <img src={theme.iconUrl} alt="" className="h-6 w-6 object-contain" />
      ) : (
        isThemeIcon(theme.icon) && <ThemeIconSvg name={theme.icon} size={22} />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-center gap-2 font-semibold">
          <button type="button" onClick={onEdit} className="text-left hover:underline">
            {theme.name}
          </button>
          {showing && <span className="bg-black px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{s.showing}</span>}
          {isDefault && <span className="border border-black px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">{s.defaultBadge}</span>}
        </span>
        <span className="text-xs text-muted">{when}</span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onEdit} className="min-h-10 bg-black px-4 text-sm font-bold text-white">
          {s.edit}
        </button>
        <RowMenu label={`${s.more} ▾`}>
          {(close) => (
            <>
              <button type="button" disabled={busy} onClick={() => { close(); onPin(); }} className="min-h-11 px-4 text-left font-semibold hover:bg-surface">
                {pinned ? s.pinOff : s.pinOn}
              </button>
              <button type="button" disabled={busy} onClick={() => { close(); onDefault(); }} className="min-h-11 border-t border-line px-4 text-left font-semibold hover:bg-surface">
                {isDefault ? s.unsetDefault : s.setDefault}
              </button>
              <button type="button" disabled={busy} onClick={() => { close(); onCopy(); }} className="min-h-11 border-t border-line px-4 text-left font-semibold hover:bg-surface">
                {s.copy}
              </button>
              <a
                href={`/${lang}?themePreview=${theme.id}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={close}
                className="flex min-h-11 items-center px-4 font-semibold hover:bg-surface"
              >
                {s.previewSite} ↗
              </a>
              <button type="button" disabled={busy} onClick={() => { close(); onDelete(); }} className="min-h-11 border-t border-line px-4 text-left font-semibold hover:bg-surface">
                {s.delete}
              </button>
            </>
          )}
        </RowMenu>
      </div>
    </li>
  );
}

// A small menu under a button. Closes on a tap anywhere outside it, on Escape, or after choosing.
function RowMenu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex min-h-10 items-center border-[1.5px] border-black px-3 text-sm font-bold"
      >
        {label}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 flex w-56 flex-col border-[1.5px] border-black bg-white text-sm shadow-[4px_4px_0_#000]">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// One part of the editor that folds open and closed, to keep the long form short.
function Section({ title, open = false, invalid = false, children }: { title: string; open?: boolean; invalid?: boolean; children: ReactNode }) {
  return (
    <details open={open} className={`group border-[1.5px] bg-white ${invalid ? "border-black outline outline-2 outline-black" : "border-black"}`}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 font-bold [&::-webkit-details-marker]:hidden">
        {title}
        <span aria-hidden="true" className="transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-line p-4">{children}</div>
    </details>
  );
}

function ThemeEditor({
  theme,
  presets,
  settings,
  busy: switching,
  onPin,
  themes,
  onSwitch,
  onBack,
  onSaved,
}: {
  theme: AdminTheme;
  presets: ThemeBundle["presets"];
  settings: ThemeBundle["settings"];
  busy: boolean;
  onPin: (id: number | null) => void;
  themes: AdminTheme[]; // all looks, to jump to another one without going back to the list
  onSwitch: (id: number) => void;
  onBack: () => void;
  onSaved: (bundle: ThemeBundle) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { t, lang } = useAdminI18n();
  const s = t.themes;
  const [draft, setDraft] = useState<AdminThemeInput>(() => toInput(theme));
  const [busy, setBusy] = useState(false);
  const [badFields, setBadFields] = useState<string[]>([]);
  const [phone, setPhone] = useState(false);

  function update(changes: Partial<AdminThemeInput>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  function setColor(key: ColorKey, value: string | null) {
    setDraft((current) => {
      const colors = { ...current.colors };
      if (value) colors[key] = value;
      else delete colors[key];
      return { ...current, colors };
    });
  }

  // Unsaved = different from the saved look (changing something and back again is not a change).
  const dirty = !sameData(draft, toInput(theme));
  useUnsavedGuard(dirty);

  async function save(): Promise<boolean> {
    setBusy(true);
    setBadFields([]);
    try {
      const next = await adminApi.saveTheme(theme.id, draft);
      onSaved(next);
      // Take the saved version (the server tidies empty texts etc.), so the page reads "Saved".
      const savedTheme = next.themes.find((item) => item.id === theme.id);
      if (savedTheme) setDraft(toInput(savedTheme));
      toast.success(s.saved);
      return true;
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) router.replace("/admin/login");
      else if (error instanceof AdminValidationError) {
        setBadFields(error.fields);
        toast.error(s.invalid);
      } else toast.error(s.unknownError);
      return false;
    } finally {
      setBusy(false);
    }
  }

  // "Turn on now" shows the saved version, so unsaved changes are saved first.
  async function turnOn() {
    if (dirty && !(await save())) return;
    onPin(theme.id);
  }

  function back() {
    if (!dirty || window.confirm(s.leaveConfirm)) onBack();
  }

  // Opens another look in the editor; asks first when this one has unsaved changes.
  function switchTo(id: number) {
    if (id === theme.id) return;
    if (!dirty || window.confirm(s.switchConfirm)) onSwitch(id);
  }
  const index = themes.findIndex((item) => item.id === theme.id);
  const previous = index > 0 ? themes[index - 1] : null;
  const next = index >= 0 && index < themes.length - 1 ? themes[index + 1] : null;

  const bad = (field: string) => badFields.includes(field);
  // Which color set the colors match now: a ready-made one first, else another look of the shop.
  const otherLooks = themes.filter((item) => item.id !== theme.id);
  const matchingPreset = presets.find((item) => sameColors(item.colors, draft.colors));
  const matchingLook = otherLooks.find((item) => sameColors(item.colors, draft.colors));
  const colorSource = matchingPreset ? matchingPreset.key : matchingLook ? `look:${matchingLook.id}` : "";
  const pinnedHere = settings.themePinnedId === theme.id && !settings.pinExpired;

  return (
    <div data-savable className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={back} className="py-2 text-sm font-semibold underline">
          {s.back}
        </button>
        {/* Jump to another look: arrows for the one before/after in the list, or pick from the list. */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => previous && switchTo(previous.id)}
            disabled={!previous}
            aria-label={s.previousLook}
            title={previous ? `${s.previousLook}: ${previous.name}` : s.previousLook}
            className="flex h-11 w-11 items-center justify-center border-[1.5px] border-black text-lg font-bold disabled:opacity-30"
          >
            ‹
          </button>
          <label className="sr-only" htmlFor="theme-switcher">
            {s.switchLook}
          </label>
          <select
            id="theme-switcher"
            value={theme.id}
            onChange={(event) => switchTo(Number(event.target.value))}
            className="h-11 max-w-[60vw] border-[1.5px] border-black bg-white px-3 text-sm font-semibold sm:w-64"
          >
            {themes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => next && switchTo(next.id)}
            disabled={!next}
            aria-label={s.nextLook}
            title={next ? `${s.nextLook}: ${next.name}` : s.nextLook}
            className="flex h-11 w-11 items-center justify-center border-[1.5px] border-black text-lg font-bold disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {s.colors.fromPreset}
            {/* Ready-made sets (value = preset key) and the shop's other looks (value = "look:<id>"),
                so colors fine-tuned once can be reused. Shows which set the colors match now. */}
            <select
              value={colorSource}
              onChange={(event) => {
                const value = event.target.value;
                const other = value.startsWith("look:") ? otherLooks.find((item) => `look:${item.id}` === value) : undefined;
                const preset = presets.find((item) => item.key === value);
                const colors = other?.colors ?? preset?.colors;
                if (colors) update({ colors: { ...colors } });
              }}
              className={input}
            >
              <option value="" disabled>
                {Object.keys(draft.colors).length === 0 ? s.colors.fromPresetNone : s.colors.fromPresetCustom}
              </option>
              {otherLooks.length > 0 && (
                <optgroup label={s.colors.yourLooks}>
                  {otherLooks.map((item) => (
                    <option key={item.id} value={`look:${item.id}`}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <PresetOptions presets={presets} />
            </select>
            <span className="text-xs font-normal text-muted">{s.colors.fromPresetHint}</span>
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {s.name}
            <input
              value={draft.name}
              maxLength={60}
              onChange={(event) => update({ name: event.target.value })}
              className={`${input} ${bad("name") ? "outline outline-2 outline-black" : ""}`}
            />
          </label>

          <Section title={s.sections.colors} open invalid={bad("colors")}>
            <ColorsEditor colors={draft.colors} onColor={setColor} />
          </Section>

          <Section title={s.sections.message} invalid={bad("messageVi") || bad("messageEn") || bad("linkUrl")}>
            <MessageEditor draft={draft} invalidLink={bad("linkUrl")} update={update} />
          </Section>

          <Section title={s.sections.icon} invalid={bad("icon") || bad("iconUrl")}>
            <p className="text-xs text-muted">{s.icon.hint}</p>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              {s.icon.builtIn}
              <span className="flex items-center gap-3">
                <select value={draft.icon ?? ""} onChange={(event) => update({ icon: event.target.value || null })} className={input}>
                  <option value="">{s.icon.none}</option>
                  {THEME_ICONS.map((name) => (
                    <option key={name} value={name}>
                      {s.icon.names[name]}
                    </option>
                  ))}
                </select>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center border border-line">
                  {isThemeIcon(draft.icon) && <ThemeIconSvg name={draft.icon} size={24} />}
                </span>
              </span>
            </label>
            <SmallImageUpload label={s.icon.own} hint={s.icon.ownHint} value={draft.iconUrl} onChange={(iconUrl) => update({ iconUrl })} />
          </Section>

          <Section title={s.sections.effect} invalid={bad("effectPieces") || bad("effectImages")}>
            <EffectEditor draft={draft} update={update} />
          </Section>

          <Section title={s.sections.schedule} invalid={bad("startDate") || bad("endDate")}>
            <label className="flex min-h-11 items-center gap-2.5 text-sm font-semibold">
              <input type="checkbox" checked={draft.scheduleOn} onChange={(event) => update({ scheduleOn: event.target.checked })} className="h-5 w-5 accent-black" />
              {s.schedule.on}
            </label>
            <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${draft.scheduleOn ? "" : "opacity-60"}`}>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                {s.schedule.start}
                <input
                  type="date"
                  value={draft.startDate ?? ""}
                  onChange={(event) => update({ startDate: event.target.value || null })}
                  className={`${input} ${bad("startDate") ? "outline outline-2 outline-black" : ""}`}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                {s.schedule.end}
                <input
                  type="date"
                  value={draft.endDate ?? ""}
                  onChange={(event) => update({ endDate: event.target.value || null })}
                  className={`${input} ${bad("endDate") ? "outline outline-2 outline-black" : ""}`}
                />
              </label>
            </div>
            <label className="flex min-h-11 items-center gap-2.5 text-sm">
              <input type="checkbox" checked={draft.yearly} onChange={(event) => update({ yearly: event.target.checked })} className="h-5 w-5 accent-black" />
              {s.schedule.yearly}
            </label>
            {draft.scheduleOn && (!draft.startDate || !draft.endDate) && <p className="text-sm font-semibold">{s.schedule.needDates}</p>}
            <p className="text-xs text-muted">{s.schedule.hint}</p>
          </Section>
        </div>

        <div className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold">{s.preview.title}</h2>
            <PreviewModeSwitch phone={phone} onChange={setPhone} />
          </div>
          <ThemePreview look={draft} phone={phone} />
        </div>
      </div>

      {/* Save bar stays at the bottom of the screen while scrolling the long form. */}
      <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-t-[1.5px] border-black bg-white px-4 py-3 md:-mx-8 md:px-8">
        <SaveButton type="button" onClick={() => void save()} dirty={dirty} saving={busy} label={s.save} savingLabel={s.saving} />
        <a
          href={`/${lang}?themePreview=${theme.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-12 items-center border-[1.5px] border-black px-5 text-sm font-bold"
        >
          {s.previewSite} ↗
        </a>
        {pinnedHere ? (
          <button
            type="button"
            onClick={() => onPin(null)}
            disabled={switching}
            className="flex min-h-12 items-center border-[1.5px] border-black px-5 text-sm font-bold disabled:opacity-50"
          >
            {s.pinOff}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void turnOn()}
            disabled={switching}
            className="flex min-h-12 items-center border-[1.5px] border-black px-5 text-sm font-bold disabled:opacity-50"
          >
            {s.pinOn}
          </button>
        )}
        {pinnedHere && <PinNote settings={settings} />}
        {dirty && <span className="w-full text-xs text-muted">{s.previewNeedsSave}</span>}
      </div>
    </div>
  );
}

function ColorsEditor({ colors, onColor }: { colors: ThemeColors; onColor: (key: ColorKey, value: string | null) => void }) {
  const { t } = useAdminI18n();
  const c = t.themes.colors;

  return (
    <>
      <p className="text-xs text-muted">{c.hint}</p>

      <ul className="flex flex-col divide-y divide-line">
        {COLOR_PAIRS.map(({ part, bg, ink }) => {
          const on = Boolean(colors[bg] || colors[ink]);
          const bgColor = colors[bg] ?? DEFAULT_COLORS[bg];
          const inkColor = colors[ink] ?? DEFAULT_COLORS[ink];
          const readable = contrastRatio(bgColor, inkColor) >= READABLE;
          return (
            <li key={part} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">{c.parts[part]}</span>
                  <span className="text-xs text-muted">{c.partHints[part]}</span>
                </span>
                <label className="flex min-h-10 items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(event) => {
                      if (event.target.checked) {
                        onColor(bg, bgColor);
                        onColor(ink, inkColor);
                      } else {
                        onColor(bg, null);
                        onColor(ink, null);
                      }
                    }}
                    className="h-5 w-5 accent-black"
                  />
                  {c.change}
                </label>
              </div>
              {on && (
                <div className="flex flex-wrap items-center gap-4">
                  <ColorField label={c.background} value={bgColor} onChange={(value) => onColor(bg, value)} />
                  <ColorField label={c.text} value={inkColor} onChange={(value) => onColor(ink, value)} />
                  <span className="px-3 py-1.5 text-sm font-bold" style={{ background: bgColor, color: inkColor }}>
                    Aa
                  </span>
                  <span className={`text-xs font-bold ${readable ? "text-muted" : "underline"}`}>{readable ? `✓ ${c.readable}` : `! ${c.hard}`}</span>
                  {!readable && <span className="w-full text-xs">{c.hardHint}</span>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold">
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-12 cursor-pointer border-[1.5px] border-black bg-white p-0.5" />
      <span className="flex flex-col">
        {label}
        <span className="font-mono font-normal text-muted">{value}</span>
      </span>
    </label>
  );
}

function MessageEditor({
  draft,
  invalidLink,
  update,
}: {
  draft: AdminThemeInput;
  invalidLink: boolean;
  update: (changes: Partial<AdminThemeInput>) => void;
}) {
  const { t } = useAdminI18n();
  const m = t.themes.message;
  const known = (QUICK_LINKS as readonly string[]).includes(draft.linkUrl ?? "");
  const [other, setOther] = useState(Boolean(draft.linkUrl) && !known);
  const [otherText, setOtherText] = useState(draft.linkUrl && !known ? draft.linkUrl : "");
  const choice = other ? "other" : (draft.linkUrl ?? "");
  const area = "min-h-20 w-full border-[1.5px] border-black bg-white px-3 py-2 text-[15px] font-normal";

  return (
    <>
      <p className="text-xs text-muted">{m.hint}</p>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        {m.vi}
        <textarea value={draft.messageVi ?? ""} maxLength={400} onChange={(event) => update({ messageVi: event.target.value || null })} className={area} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        {m.en}
        <textarea value={draft.messageEn ?? ""} maxLength={400} onChange={(event) => update({ messageEn: event.target.value || null })} className={area} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        {m.link}
        <select
          value={choice}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "other") {
              setOther(true);
              update({ linkUrl: normalizeBannerLink(otherText) });
            } else {
              setOther(false);
              update({ linkUrl: value || null });
            }
          }}
          className={input}
        >
          <option value="">{m.linkNone}</option>
          <option value="/menu">{m.linkMenu}</option>
          <option value="/news">{m.linkNews}</option>
          <option value="/order">{m.linkOrder}</option>
          <option value="/track">{m.linkTrack}</option>
          <option value="other">{m.linkOther}</option>
        </select>
      </label>
      {other && (
        <label className="flex flex-col gap-1.5 text-xs text-muted">
          <input
            value={otherText}
            maxLength={300}
            placeholder="https://"
            onChange={(event) => {
              setOtherText(event.target.value);
              update({ linkUrl: normalizeBannerLink(event.target.value) });
            }}
            className={`${input} ${invalidLink ? "outline outline-2 outline-black" : ""}`}
          />
          {m.linkOtherHint}
        </label>
      )}
    </>
  );
}

function EffectEditor({ draft, update }: { draft: AdminThemeInput; update: (changes: Partial<AdminThemeInput>) => void }) {
  const { t } = useAdminI18n();
  const e = t.themes.effect;
  const chosen = new Set<string>(draft.effectPieces.map((piece) => piece.kind));
  const sliders = [
    { key: "effectAmount", label: e.amount, low: e.few, high: e.many, min: 10 },
    { key: "effectSpeed", label: e.speed, low: e.slow, high: e.fast, min: 10 },
    { key: "effectSize", label: e.size, low: e.small, high: e.big, min: 10 },
    { key: "effectSizeMix", label: e.sizeMix, low: e.mixSame, high: e.mixMixed, min: 0 },
  ] as const;

  function setPieces(pieces: AdminThemeInput["effectPieces"]) {
    update({ effectPieces: pieces });
  }

  return (
    <>
      <label className="flex min-h-11 items-center gap-2.5 text-sm font-semibold">
        <input type="checkbox" checked={draft.effectOn} onChange={(event) => update({ effectOn: event.target.checked })} className="h-5 w-5 accent-black" />
        {e.on}
      </label>
      <div className={`flex flex-col gap-4 ${draft.effectOn ? "" : "pointer-events-none opacity-50"}`}>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">{e.pieces}</span>
          {draft.effectPieces.length === 0 && draft.effectImages.length === 0 && <p className="text-xs text-muted">{e.noPieces}</p>}
          {draft.effectPieces.length > 0 && (
            <ul className="flex flex-col divide-y divide-line border-[1.5px] border-black">
              {draft.effectPieces.map((piece) => (
                <li key={piece.kind} className="flex items-center gap-3 px-3 py-2">
                  <PieceIcon kind={piece.kind} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-semibold">{e.names[piece.kind]}</span>
                    <span className="text-xs text-muted">{e.motions[PIECE_MOTION[piece.kind]]}</span>
                  </span>
                  <select
                    value={piece.weight}
                    aria-label={e.weight}
                    onChange={(event) =>
                      setPieces(draft.effectPieces.map((item) => (item.kind === piece.kind ? { ...item, weight: Number(event.target.value) } : item)))
                    }
                    className="h-10 border-[1.5px] border-black bg-white px-2 text-sm"
                  >
                    <option value={1}>{e.weightFew}</option>
                    <option value={2}>{e.weightSome}</option>
                    <option value={3}>{e.weightMany}</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setPieces(draft.effectPieces.filter((item) => item.kind !== piece.kind))}
                    aria-label={e.removePiece.replace("{name}", e.names[piece.kind])}
                    className="flex h-10 w-10 items-center justify-center text-lg font-bold"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <select
            value=""
            disabled={draft.effectPieces.length >= MAX_PIECES}
            onChange={(event) => {
              const kind = event.target.value as PieceKind;
              if (kind && !chosen.has(kind)) setPieces([...draft.effectPieces, { kind, weight: 2 }]);
            }}
            className={input}
          >
            <option value="">{draft.effectPieces.length >= MAX_PIECES ? e.piecesFull : e.addPiece}</option>
            {(Object.keys(PIECE_GROUPS) as (keyof typeof PIECE_GROUPS)[]).map((group) => (
              <optgroup key={group} label={e.groups[group]}>
                {(PIECE_GROUPS[group] as readonly PieceKind[]).map((kind) => (
                  <option key={kind} value={kind} disabled={chosen.has(kind)}>
                    {e.names[kind]}
                    {chosen.has(kind) ? " ✓" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-3">
          {draft.effectImages.map((url, index) => (
            <SmallImageUpload
              key={url}
              label={`${e.image} ${index + 1}`}
              hint=""
              value={url}
              onChange={(next) =>
                update({
                  effectImages: next
                    ? draft.effectImages.map((item, i) => (i === index ? next : item))
                    : draft.effectImages.filter((_, i) => i !== index),
                })
              }
            />
          ))}
          {draft.effectImages.length < MAX_EFFECT_IMAGES && (
            <SmallImageUpload
              label={draft.effectImages.length === 0 ? e.image : e.addImage}
              hint={e.imageHint}
              value={null}
              onChange={(next) => next && update({ effectImages: [...draft.effectImages, next] })}
            />
          )}
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {e.where}
          <select
            value={draft.effectAllPages ? "all" : "home"}
            onChange={(event) => update({ effectAllPages: event.target.value === "all" })}
            className={input}
          >
            <option value="home">{e.homeOnly}</option>
            <option value="all">{e.allPages}</option>
          </select>
        </label>
        {sliders.map((slider) => (
          <label key={slider.key} className="flex flex-col gap-1 text-sm font-semibold">
            {slider.label}
            <input
              type="range"
              min={slider.min}
              max={100}
              step={10}
              value={draft[slider.key]}
              onChange={(event) => {
                const changes: Partial<AdminThemeInput> = {};
                changes[slider.key] = Number(event.target.value);
                update(changes);
              }}
              className="accent-black"
            />
            <span className="flex justify-between text-xs font-normal text-muted">
              <span>{slider.low}</span>
              <span>{slider.high}</span>
            </span>
          </label>
        ))}
        <p className="text-xs text-muted">{e.hint}</p>
      </div>
    </>
  );
}

// Upload a small picture (icon or falling picture). Transparent backgrounds are kept.
function SmallImageUpload({ label, hint, value, onChange }: { label: string; hint: string; value: string | null; onChange: (url: string | null) => void }) {
  const router = useRouter();
  const toast = useToast();
  const { t } = useAdminI18n();
  const m = t.themes.icon;
  const [uploading, setUploading] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type) || file.size > MAX_PHOTO_BYTES) {
      toast.error(m.uploadFailed);
      return;
    }
    setUploading(true);
    try {
      const { url } = await adminApi.uploadImage("theme", file);
      onChange(url);
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) router.replace("/admin/login");
      else toast.error(m.uploadFailed);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold">{label}</span>
      <div className="flex items-center gap-3">
        {/* Checkered background shows whether the picture's background is transparent. */}
        <span className="flex h-14 w-14 shrink-0 items-center justify-center border border-line bg-[repeating-conic-gradient(#e5e5e5_0%_25%,#ffffff_0%_50%)] bg-[length:12px_12px]">
          {value && (
            // eslint-disable-next-line @next/next/no-img-element -- admin preview of an uploaded picture
            <img src={value} alt="" className="h-12 w-12 object-contain" />
          )}
        </span>
        <label className={`flex min-h-11 cursor-pointer items-center border-[1.5px] border-black px-4 text-sm font-bold ${uploading ? "pointer-events-none opacity-60" : ""}`}>
          {uploading ? m.uploading : value ? m.change : m.upload}
          <input
            type="file"
            accept={PHOTO_TYPES.join(",")}
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              void pick(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        {value && !uploading && (
          <button type="button" onClick={() => onChange(null)} className="min-h-11 px-2 text-sm font-semibold underline">
            {m.remove}
          </button>
        )}
      </div>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
