"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  adminApi,
  AdminApiError,
  AdminValidationError,
  type AdminComingSoon,
  type AdminSeason,
  type ComingSoonInput,
  type HomeBundle,
  type HomeContentInput,
  type SeasonInput,
} from "@/lib/admin-api";
import { useAdminI18n } from "./AdminI18n";
import { AdminFormSkeleton } from "./AdminSkeletons";
import { ImageUploadField } from "./ImageUploadField";
import { useToast } from "./Toast";

// Staff page for everything on the homepage: the top bar, the big banner,
// seasons and the "coming soon" cards.

type ProductChoice = HomeBundle["products"][number];

const inputBase = "h-11 w-full border-[1.5px] bg-white px-3 text-[15px] font-normal";
const nullable = (value: string) => (value.trim() === "" ? null : value);

// Today's date in Vietnam as YYYY-MM-DD (only used in the browser).
function vietnamTodayText(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border border-[#e0e0e0] bg-white p-5 md:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl uppercase tracking-wide">{title}</h2>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

// Handles the errors every save on this page can hit. Returns the fields to highlight.
function useSaveErrors() {
  const router = useRouter();
  const toast = useToast();
  const { t } = useAdminI18n();
  return (error: unknown): string[] => {
    if (error instanceof AdminApiError && error.status === 401) {
      router.replace("/admin/login");
      return [];
    }
    if (error instanceof AdminValidationError) {
      toast.error(t.home.invalid);
      return error.fields;
    }
    toast.error(t.home.unknownError);
    return [];
  };
}

export function HomeEditor() {
  const router = useRouter();
  const { t } = useAdminI18n();
  const [bundle, setBundle] = useState<HomeBundle | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    adminApi
      .getHome()
      .then(setBundle)
      .catch((error: unknown) => {
        if (error instanceof AdminApiError && error.status === 401) {
          router.replace("/admin/login");
          return;
        }
        setLoadFailed(true);
      });
  }, [router]);

  if (loadFailed) {
    return (
      <p role="alert" className="border-[1.5px] border-black bg-white p-4 font-semibold">
        {t.home.loadError}
      </p>
    );
  }
  if (!bundle) {
    return <AdminFormSkeleton label={t.home.loading} />;
  }

  return (
    <div className="flex flex-col gap-10">
      <ContentForm content={bundle.content} products={bundle.products} onSaved={setBundle} />
      <SeasonsSection seasons={bundle.seasons} products={bundle.products} onSaved={setBundle} />
      <ComingSoonSection items={bundle.comingSoon} onSaved={setBundle} />
    </div>
  );
}

// ---------- Top bar and banner ----------

function ContentForm({
  content,
  products,
  onSaved,
}: {
  content: HomeContentInput;
  products: ProductChoice[];
  onSaved: (bundle: HomeBundle) => void;
}) {
  const { t, lang } = useAdminI18n();
  const h = t.home;
  const toast = useToast();
  const handleError = useSaveErrors();
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);
  const [badFields, setBadFields] = useState<string[]>([]);

  useEffect(() => setDraft(content), [content]);

  function update<K extends keyof HomeContentInput>(key: K, value: HomeContentInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setBadFields([]);
    try {
      onSaved(await adminApi.saveHome(draft));
      toast.success(h.saved);
    } catch (error) {
      setBadFields(handleError(error));
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = (field: string) =>
    `${inputBase} ${badFields.includes(field) ? "border-black bg-[#fff6f6] outline outline-2 outline-offset-1 outline-black" : "border-black"}`;

  // One text in both languages, side by side.
  const pair = (keyVi: keyof HomeContentInput, keyEn: keyof HomeContentInput, label: string, long = false) => (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {(
        [
          [keyVi, `${label} (VI)`],
          [keyEn, `${label} (EN)`],
        ] as const
      ).map(([key, text]) => (
        <label key={key} className="flex flex-col gap-1.5 text-sm font-semibold">
          {text}
          {long ? (
            <textarea
              rows={2}
              value={(draft[key] as string | null) ?? ""}
              onChange={(e) => update(key, nullable(e.target.value) as never)}
              className={`${fieldClass(key)} h-auto py-2.5`}
            />
          ) : (
            <input
              value={(draft[key] as string | null) ?? ""}
              onChange={(e) => update(key, nullable(e.target.value) as never)}
              className={fieldClass(key)}
            />
          )}
        </label>
      ))}
    </div>
  );

  const productSelect = (key: "heroProductId" | "announcementProductId", label: string) => (
    <label className="flex flex-col gap-1.5 text-sm font-semibold md:max-w-md">
      {label}
      <select
        value={draft[key] ?? ""}
        onChange={(e) => update(key, e.target.value ? Number(e.target.value) : null)}
        className={fieldClass(key)}
      >
        <option value="">{h.linkToMenu}</option>
        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {lang === "vi" ? product.nameVi : product.nameEn}
            {product.isActive ? "" : ` (${h.hiddenProduct})`}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#e0e0e0] bg-[#fafafa]/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <h1 className="font-display text-3xl uppercase md:text-[40px]">{h.title}</h1>
        <button type="submit" disabled={saving} className="min-h-11 bg-black px-6 font-bold text-white hover:bg-[#333333] disabled:opacity-60">
          {saving ? h.saving : h.save}
        </button>
      </div>

      <Section title={h.announcement.title} hint={h.announcement.hint}>
        {pair("announcementCenterVi", "announcementCenterEn", h.announcement.center)}
        {productSelect("announcementProductId", h.announcement.link)}
        {pair("announcementLeftVi", "announcementLeftEn", h.announcement.left)}
        {pair("announcementRightVi", "announcementRightEn", h.announcement.right)}
      </Section>

      <Section title={h.hero.title} hint={h.hero.hint}>
        <label className="flex items-center gap-2.5 font-semibold">
          <input
            type="checkbox"
            checked={draft.heroIsActive}
            onChange={(e) => update("heroIsActive", e.target.checked)}
            className="h-5 w-5 accent-black"
          />
          {h.hero.show}
        </label>
        {pair("heroEyebrowVi", "heroEyebrowEn", h.hero.eyebrow)}
        {pair("heroTitleVi", "heroTitleEn", h.hero.heading)}
        {pair("heroSubtitleVi", "heroSubtitleEn", h.hero.subtitle, true)}
        {pair("heroCtaVi", "heroCtaEn", h.hero.button)}
        {productSelect("heroProductId", h.hero.link)}
        <ImageUploadField
          kind="banner"
          value={draft.heroImageUrl}
          onChange={(url) => update("heroImageUrl", url)}
          invalid={badFields.includes("heroImageUrl")}
          saveLabel={h.save}
        />
      </Section>
    </form>
  );
}

// ---------- Seasons ----------

const EMPTY_SEASON: SeasonInput = {
  nameVi: "",
  nameEn: "",
  eyebrowVi: null,
  eyebrowEn: null,
  descriptionVi: null,
  descriptionEn: null,
  startDate: "",
  endDate: "",
  isActive: true,
  productIds: [],
};

function SeasonsSection({
  seasons,
  products,
  onSaved,
}: {
  seasons: AdminSeason[];
  products: ProductChoice[];
  onSaved: (bundle: HomeBundle) => void;
}) {
  const { t, lang } = useAdminI18n();
  const s = t.home.seasons;
  // null = list only; "new" = creating; a number = editing that season
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const today = vietnamTodayText();

  const status = (season: AdminSeason) => {
    if (!season.isActive) return s.status.off;
    if (season.endDate < today) return s.status.ended;
    if (season.startDate > today) return s.status.upcoming;
    return s.status.running;
  };

  return (
    <Section title={s.title} hint={s.hint}>
      {seasons.length === 0 && editing !== "new" && <p className="text-sm text-muted">{s.empty}</p>}
      <ul className="flex flex-col gap-3">
        {seasons.map((season) => (
          <li key={season.id} className="border border-[#e0e0e0]">
            {editing === season.id ? (
              <SeasonForm
                initial={season}
                seasonId={season.id}
                products={products}
                onSaved={onSaved}
                onClose={() => setEditing(null)}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex flex-col gap-1">
                  <span className="font-bold">{lang === "vi" ? season.nameVi : season.nameEn}</span>
                  <span className="text-sm text-muted">
                    {season.startDate} → {season.endDate} · {s.cakes.replace("{count}", String(season.productIds.length))}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${status(season) === s.status.running ? "bg-black text-white" : "border border-black"}`}
                  >
                    {status(season)}
                  </span>
                  <button
                    type="button"
                    disabled={editing !== null}
                    onClick={() => setEditing(season.id)}
                    className="min-h-11 px-2 text-sm font-semibold underline disabled:opacity-40"
                  >
                    {s.edit}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {editing === "new" ? (
        <div className="border-[1.5px] border-black">
          <SeasonForm initial={EMPTY_SEASON} seasonId={null} products={products} onSaved={onSaved} onClose={() => setEditing(null)} />
        </div>
      ) : (
        <button
          type="button"
          disabled={editing !== null}
          onClick={() => setEditing("new")}
          className="self-start border-[1.5px] border-black px-4 py-2.5 text-sm font-bold disabled:opacity-40"
        >
          + {s.add}
        </button>
      )}
    </Section>
  );
}

function SeasonForm({
  initial,
  seasonId,
  products,
  onSaved,
  onClose,
}: {
  initial: SeasonInput;
  seasonId: number | null;
  products: ProductChoice[];
  onSaved: (bundle: HomeBundle) => void;
  onClose: () => void;
}) {
  const { t, lang } = useAdminI18n();
  const s = t.home.seasons;
  const toast = useToast();
  const handleError = useSaveErrors();
  const [draft, setDraft] = useState<SeasonInput>({
    nameVi: initial.nameVi,
    nameEn: initial.nameEn,
    eyebrowVi: initial.eyebrowVi,
    eyebrowEn: initial.eyebrowEn,
    descriptionVi: initial.descriptionVi,
    descriptionEn: initial.descriptionEn,
    startDate: initial.startDate,
    endDate: initial.endDate,
    isActive: initial.isActive,
    productIds: initial.productIds,
  });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [badFields, setBadFields] = useState<string[]>([]);

  function update<K extends keyof SeasonInput>(key: K, value: SeasonInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleProduct(id: number, checked: boolean) {
    // Keep the menu order, so the homepage shows cakes in the same order as the menu.
    const chosen = new Set(draft.productIds);
    if (checked) chosen.add(id);
    else chosen.delete(id);
    update(
      "productIds",
      products.filter((p) => chosen.has(p.id)).map((p) => p.id),
    );
  }

  async function run(action: () => Promise<HomeBundle>, successText: string) {
    setBusy(true);
    setBadFields([]);
    try {
      onSaved(await action());
      toast.success(successText);
      onClose();
    } catch (error) {
      setBadFields(handleError(error));
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(
      () => (seasonId ? adminApi.updateSeason(seasonId, draft) : adminApi.createSeason(draft)),
      t.home.saved,
    );
  }

  const fieldClass = (field: string) =>
    `${inputBase} ${badFields.includes(field) ? "border-black bg-[#fff6f6] outline outline-2 outline-offset-1 outline-black" : "border-black"}`;
  const textInput = (key: "nameVi" | "nameEn" | "eyebrowVi" | "eyebrowEn", label: string, required = false) => (
    <label className="flex flex-col gap-1.5 text-sm font-semibold">
      {label}
      <input
        required={required}
        value={draft[key] ?? ""}
        onChange={(e) => update(key, required ? e.target.value : nullable(e.target.value))}
        className={fieldClass(key)}
      />
    </label>
  );

  return (
    <form onSubmit={save} className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {textInput("nameVi", s.nameVi, true)}
        {textInput("nameEn", s.nameEn, true)}
        {textInput("eyebrowVi", s.eyebrowVi)}
        {textInput("eyebrowEn", s.eyebrowEn)}
        {(["descriptionVi", "descriptionEn"] as const).map((key) => (
          <label key={key} className="flex flex-col gap-1.5 text-sm font-semibold">
            {key === "descriptionVi" ? s.descriptionVi : s.descriptionEn}
            <textarea
              rows={2}
              value={draft[key] ?? ""}
              onChange={(e) => update(key, nullable(e.target.value))}
              className={`${fieldClass(key)} h-auto py-2.5`}
            />
          </label>
        ))}
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {s.start}
          <input type="date" required value={draft.startDate} onChange={(e) => update("startDate", e.target.value)} className={fieldClass("startDate")} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {s.end}
          <input type="date" required value={draft.endDate} onChange={(e) => update("endDate", e.target.value)} className={fieldClass("endDate")} />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="pb-1 text-sm font-semibold">{s.products}</legend>
        <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          {products.map((product) => (
            <label key={product.id} className="flex min-h-11 items-center gap-2.5 text-[15px]">
              <input
                type="checkbox"
                checked={draft.productIds.includes(product.id)}
                onChange={(e) => toggleProduct(product.id, e.target.checked)}
                className="h-5 w-5 accent-black"
              />
              {lang === "vi" ? product.nameVi : product.nameEn}
              {!product.isActive && <span className="text-xs text-muted">({t.home.hiddenProduct})</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2.5 font-semibold">
        <input type="checkbox" checked={draft.isActive} onChange={(e) => update("isActive", e.target.checked)} className="h-5 w-5 accent-black" />
        {s.active}
      </label>

      <div className="flex flex-wrap items-center gap-3 border-t border-[#eeeeee] pt-4">
        <button type="submit" disabled={busy} className="min-h-11 bg-black px-5 text-sm font-bold text-white disabled:opacity-60">
          {busy ? t.home.saving : s.save}
        </button>
        <button type="button" disabled={busy} onClick={onClose} className="min-h-11 px-2 text-sm font-semibold underline">
          {s.cancel}
        </button>
        {seasonId &&
          (confirmDelete ? (
            <span className="ml-auto flex flex-wrap items-center gap-2 text-sm font-semibold">
              {s.confirmDelete}
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => adminApi.deleteSeason(seasonId), s.deleted)}
                className="min-h-11 border-[1.5px] border-black px-3 font-bold"
              >
                {s.yesDelete}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-11 px-2 underline">
                {s.no}
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="ml-auto min-h-11 px-2 text-sm font-semibold underline">
              {s.delete}
            </button>
          ))}
      </div>
    </form>
  );
}

// ---------- Coming soon ----------

function ComingSoonSection({ items, onSaved }: { items: AdminComingSoon[]; onSaved: (bundle: HomeBundle) => void }) {
  const { t } = useAdminI18n();
  const c = t.home.comingSoon;
  const toast = useToast();
  const handleError = useSaveErrors();
  const [rows, setRows] = useState(items);
  const [draft, setDraft] = useState({ dateLabel: "", nameVi: "", nameEn: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => setRows(items), [items]);

  async function run(action: () => Promise<HomeBundle>, successText: string) {
    setBusy(true);
    try {
      onSaved(await action());
      toast.success(successText);
      return true;
    } catch (error) {
      handleError(error);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function edit(id: number, change: Partial<AdminComingSoon>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)));
  }

  const toInput = ({ id: _id, ...item }: AdminComingSoon): ComingSoonInput => item;
  const cell = `${inputBase} border-black`;

  return (
    <Section title={c.title} hint={c.hint}>
      {rows.map((row) => (
        <div key={row.id} className="grid grid-cols-2 items-end gap-2 border-b border-[#eeeeee] pb-4 md:grid-cols-[110px_1fr_1fr_1fr_1fr]">
          <label className="flex flex-col gap-1 text-xs font-semibold">
            {c.date}
            <input value={row.dateLabel} onChange={(e) => edit(row.id, { dateLabel: e.target.value })} className={cell} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            {c.nameVi}
            <input value={row.nameVi} onChange={(e) => edit(row.id, { nameVi: e.target.value })} className={cell} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            {c.nameEn}
            <input value={row.nameEn} onChange={(e) => edit(row.id, { nameEn: e.target.value })} className={cell} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            {c.noteVi}
            <input value={row.noteVi ?? ""} onChange={(e) => edit(row.id, { noteVi: nullable(e.target.value) })} className={cell} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            {c.noteEn}
            <input value={row.noteEn ?? ""} onChange={(e) => edit(row.id, { noteEn: nullable(e.target.value) })} className={cell} />
          </label>
          <div className="col-span-2 flex flex-wrap items-center gap-4 md:col-span-5">
            <label className="flex items-center gap-2 text-xs font-semibold">
              {c.order}
              <input
                type="number"
                min={0}
                value={row.sortOrder}
                onChange={(e) => edit(row.id, { sortOrder: Number(e.target.value) })}
                className={`${cell} w-20`}
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={row.isActive} onChange={(e) => edit(row.id, { isActive: e.target.checked })} className="h-5 w-5 accent-black" />
              {c.show}
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => adminApi.updateComingSoon(row.id, toInput(row)), t.home.saved)}
              className="min-h-11 border-[1.5px] border-black px-4 text-sm font-bold disabled:opacity-60"
            >
              {c.save}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => adminApi.deleteComingSoon(row.id), c.deleted)}
              className="min-h-11 px-2 text-sm font-semibold underline disabled:opacity-60"
            >
              {c.delete}
            </button>
          </div>
        </div>
      ))}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(
            () =>
              adminApi.createComingSoon({
                ...draft,
                noteVi: null,
                noteEn: null,
                isActive: true,
                sortOrder: rows.length + 1,
              }),
            c.added,
          );
          if (ok) setDraft({ dateLabel: "", nameVi: "", nameEn: "" });
        }}
        className="grid grid-cols-2 items-end gap-2 md:grid-cols-[110px_1fr_1fr_auto]"
      >
        <label className="flex flex-col gap-1 text-xs font-semibold">
          {c.date}
          <input required value={draft.dateLabel} placeholder="15/12" onChange={(e) => setDraft({ ...draft, dateLabel: e.target.value })} className={cell} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          {c.nameVi}
          <input required value={draft.nameVi} onChange={(e) => setDraft({ ...draft, nameVi: e.target.value })} className={cell} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          {c.nameEn}
          <input required value={draft.nameEn} onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })} className={cell} />
        </label>
        <button type="submit" disabled={busy} className="col-span-2 h-11 bg-black px-4 text-sm font-bold text-white disabled:opacity-60 md:col-span-1">
          {c.add}
        </button>
      </form>
    </Section>
  );
}
