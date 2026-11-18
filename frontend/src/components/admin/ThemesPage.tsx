"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  adminApi,
  AdminApiError,
  AdminValidationError,
  type AdminTheme,
  type AdminThemeInput,
  type ThemeBundle,
} from "@/lib/admin-api";
import {
  COLOR_PAIRS,
  contrastRatio,
  DEFAULT_COLORS,
  THEME_EFFECTS,
  THEME_ICONS,
  type ColorKey,
  type ThemeColors,
  type ThemeEffectKind,
} from "@/lib/site-theme";
import { isThemeIcon, ThemeIconSvg } from "../theme/ThemeIcon";
import { useAdminI18n } from "./AdminI18n";
import { AdminRowsSkeleton } from "./AdminSkeletons";
import { normalizeBannerLink } from "./BannerLinkPicker";
import { ThemePreview } from "./ThemePreview";
import { useToast } from "./Toast";

const input = "h-11 w-full border-[1.5px] border-black bg-white px-3 text-[15px] font-normal";
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const READABLE = 4.5; // contrast ratio for comfortable reading
const QUICK_LINKS = ["/menu", "/news", "/order", "/track"] as const;

function toInput(theme: AdminTheme): AdminThemeInput {
  const { id: _id, sortOrder: _sortOrder, ...rest } = theme;
  return rest;
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
      else toast.error(s.unknownError);
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (failed) return <p className="text-sm">{s.loadFailed}</p>;
  if (!bundle) return <AdminRowsSkeleton label={s.loading} />;

  const editing = editingId !== null ? bundle.themes.find((theme) => theme.id === editingId) : undefined;
  if (editing) {
    return (
      <ThemeEditor
        key={editing.id}
        theme={editing}
        presets={bundle.presets}
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

      <ModePanel bundle={bundle} busy={busy} onChange={(off, pinned) => run(() => adminApi.themeSwitches(off, pinned), t.themes.saved)} />

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
function ModePanel({ bundle, busy, onChange }: { bundle: ThemeBundle; busy: boolean; onChange: (off: boolean, pinned: number | null) => void }) {
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
      <p className="text-xs text-muted">{s.modeHint}</p>
    </section>
  );
}

function CreatePanel({ bundle, busy, onCreate }: { bundle: ThemeBundle; busy: boolean; onCreate: (preset: string | null) => void }) {
  const { t, lang } = useAdminI18n();
  const s = t.themes;
  const [preset, setPreset] = useState(bundle.presets[0]?.key ?? "");
  const chosen = bundle.presets.find((item) => item.key === preset);

  return (
    <section className="flex flex-col gap-3 border-[1.5px] border-black bg-white p-4 md:p-5">
      <h2 className="font-bold">{s.create}</h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-semibold">
          {s.createFrom}
          <select value={preset} onChange={(event) => setPreset(event.target.value)} className={input}>
            <optgroup label={s.presetGroup}>
              {bundle.presets.map((item) => (
                <option key={item.key} value={item.key}>
                  {lang === "en" ? item.nameEn : item.nameVi}
                </option>
              ))}
            </optgroup>
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
      {chosen && (
        <div className="flex items-center gap-3">
          <Swatches colors={chosen.colors} />
          {isThemeIcon(chosen.icon) && <ThemeIconSvg name={chosen.icon} size={20} />}
        </div>
      )}
    </section>
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
          {theme.name}
          {showing && <span className="bg-black px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{s.showing}</span>}
        </span>
        <span className="text-xs text-muted">{when}</span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onEdit} className="min-h-10 bg-black px-4 text-sm font-bold text-white">
          {s.edit}
        </button>
        <details className="relative">
          <summary className="flex min-h-10 cursor-pointer list-none items-center border-[1.5px] border-black px-3 text-sm font-bold [&::-webkit-details-marker]:hidden">
            {s.more} ▾
          </summary>
          <div className="absolute right-0 top-full z-20 mt-1 flex w-56 flex-col border-[1.5px] border-black bg-white text-sm shadow-[4px_4px_0_#000]">
            <button type="button" disabled={busy} onClick={onCopy} className="min-h-11 px-4 text-left font-semibold hover:bg-surface">
              {s.copy}
            </button>
            <a
              href={`/${lang}?themePreview=${theme.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center px-4 font-semibold hover:bg-surface"
            >
              {s.previewSite} ↗
            </a>
            <button type="button" disabled={busy} onClick={onDelete} className="min-h-11 border-t border-line px-4 text-left font-semibold hover:bg-surface">
              {s.delete}
            </button>
          </div>
        </details>
      </div>
    </li>
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
  onBack,
  onSaved,
}: {
  theme: AdminTheme;
  presets: ThemeBundle["presets"];
  onBack: () => void;
  onSaved: (bundle: ThemeBundle) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { t, lang } = useAdminI18n();
  const s = t.themes;
  const [draft, setDraft] = useState<AdminThemeInput>(() => toInput(theme));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [badFields, setBadFields] = useState<string[]>([]);
  const [phone, setPhone] = useState(false);

  function update(changes: Partial<AdminThemeInput>) {
    setDraft((current) => ({ ...current, ...changes }));
    setDirty(true);
  }

  function setColor(key: ColorKey, value: string | null) {
    setDraft((current) => {
      const colors = { ...current.colors };
      if (value) colors[key] = value;
      else delete colors[key];
      return { ...current, colors };
    });
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    setBadFields([]);
    try {
      onSaved(await adminApi.saveTheme(theme.id, draft));
      setDirty(false);
      toast.success(s.saved);
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) router.replace("/admin/login");
      else if (error instanceof AdminValidationError) {
        setBadFields(error.fields);
        toast.error(s.invalid);
      } else toast.error(s.unknownError);
    } finally {
      setBusy(false);
    }
  }

  function back() {
    if (!dirty || window.confirm(s.leaveConfirm)) onBack();
  }

  const bad = (field: string) => badFields.includes(field);

  return (
    <div className="flex flex-col gap-5">
      <button type="button" onClick={back} className="self-start py-2 text-sm font-semibold underline">
        {s.back}
      </button>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
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
            <ColorsEditor colors={draft.colors} presets={presets} onColor={setColor} onReplace={(colors) => update({ colors })} />
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

          <Section title={s.sections.effect} invalid={bad("effect") || bad("effectImageUrl")}>
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
            <div className="flex">
              {[false, true].map((isPhone) => (
                <button
                  key={String(isPhone)}
                  type="button"
                  onClick={() => setPhone(isPhone)}
                  aria-pressed={phone === isPhone}
                  className={`min-h-10 border-[1.5px] border-black px-3 text-xs font-bold [&+&]:-ml-[1.5px] ${phone === isPhone ? "bg-black text-white" : "bg-white"}`}
                >
                  {isPhone ? s.preview.phone : s.preview.desktop}
                </button>
              ))}
            </div>
          </div>
          <ThemePreview look={draft} phone={phone} />
        </div>
      </div>

      {/* Save bar stays at the bottom of the screen while scrolling the long form. */}
      <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-t-[1.5px] border-black bg-white px-4 py-3 md:-mx-8 md:px-8">
        <button type="button" onClick={save} disabled={busy} className="min-h-12 bg-black px-8 font-bold text-white disabled:opacity-50">
          {busy ? s.saving : s.save}
        </button>
        <a
          href={`/${lang}?themePreview=${theme.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-12 items-center border-[1.5px] border-black px-5 text-sm font-bold"
        >
          {s.previewSite} ↗
        </a>
        {dirty && <span className="text-sm font-semibold">{s.unsaved}</span>}
        {dirty && <span className="w-full text-xs text-muted">{s.previewNeedsSave}</span>}
      </div>
    </div>
  );
}

function ColorsEditor({
  colors,
  presets,
  onColor,
  onReplace,
}: {
  colors: ThemeColors;
  presets: ThemeBundle["presets"];
  onColor: (key: ColorKey, value: string | null) => void;
  onReplace: (colors: ThemeColors) => void;
}) {
  const { t, lang } = useAdminI18n();
  const c = t.themes.colors;

  return (
    <>
      <p className="text-xs text-muted">{c.hint}</p>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        {c.fromPreset}
        <select
          value=""
          onChange={(event) => {
            const preset = presets.find((item) => item.key === event.target.value);
            if (preset) onReplace({ ...preset.colors });
          }}
          className={input}
        >
          <option value="">{c.fromPresetPick}</option>
          {presets.map((item) => (
            <option key={item.key} value={item.key}>
              {lang === "en" ? item.nameEn : item.nameVi}
            </option>
          ))}
        </select>
      </label>

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
  const sliders = [
    { key: "effectAmount", label: e.amount, low: e.few, high: e.many },
    { key: "effectSpeed", label: e.speed, low: e.slow, high: e.fast },
    { key: "effectSize", label: e.size, low: e.small, high: e.big },
  ] as const;

  return (
    <>
      <label className="flex min-h-11 items-center gap-2.5 text-sm font-semibold">
        <input type="checkbox" checked={draft.effectOn} onChange={(event) => update({ effectOn: event.target.checked })} className="h-5 w-5 accent-black" />
        {e.on}
      </label>
      <div className={`flex flex-col gap-4 ${draft.effectOn ? "" : "pointer-events-none opacity-50"}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {e.kind}
            <select value={draft.effect} onChange={(event) => update({ effect: event.target.value as ThemeEffectKind })} className={input}>
              {THEME_EFFECTS.map((kind) => (
                <option key={kind} value={kind}>
                  {e.names[kind]}
                </option>
              ))}
            </select>
          </label>
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
        </div>
        {draft.effect === "image" && (
          <SmallImageUpload label={e.image} hint={e.imageHint} value={draft.effectImageUrl} onChange={(effectImageUrl) => update({ effectImageUrl })} />
        )}
        {sliders.map((slider) => (
          <label key={slider.key} className="flex flex-col gap-1 text-sm font-semibold">
            {slider.label}
            <input
              type="range"
              min={10}
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
      <span className="text-xs text-muted">{hint}</span>
    </div>
  );
}
