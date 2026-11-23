"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  adminApi,
  AdminApiError,
  AdminValidationError,
  type AdminComingSoon,
  type AdminHeroSlide,
  type AdminSeason,
  type ComingSoonInput,
  type HomeBundle,
  type HeroSlideInput,
  type HomeContentInput,
  type SeasonInput,
} from "@/lib/admin-api";
import { useAdminI18n } from "./AdminI18n";
import { QuickSwitch, SaveButton, sameData, useEditableRows, useUnsavedGuard } from "./save-state";
import { SortableList } from "./SortableList";
import { BannerDesigner } from "./BannerDesigner";
import { BannerLinkPicker } from "./BannerLinkPicker";
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

function Section({ id, title, hint, children }: { id?: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-4 border border-[#e0e0e0] bg-white p-5 md:p-6">
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
      <HeroSlidesSection slides={bundle.heroSlides} products={bundle.products} onSaved={setBundle} />
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
  const dirty = !sameData(draft, content); // content = the saved version
  useUnsavedGuard(dirty);

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
    <form onSubmit={save} data-savable className="flex flex-col gap-6">
      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#e0e0e0] bg-[#fafafa]/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <h1 className="font-display text-3xl uppercase md:text-[40px]">{h.title}</h1>
        <SaveButton dirty={dirty} saving={saving} label={h.save} savingLabel={h.saving} />
      </div>

      <Section id="home-announcement" title={h.announcement.title} hint={h.announcement.hint}>
        {pair("announcementCenterVi", "announcementCenterEn", h.announcement.center, true)}
        {productSelect("announcementProductId", h.announcement.link)}
        {pair("announcementLeftVi", "announcementLeftEn", h.announcement.left)}
        {pair("announcementRightVi", "announcementRightEn", h.announcement.right)}
      </Section>

      <Section id="home-hero" title={h.hero.title} hint={h.hero.hint}>
        <label className="flex items-center gap-2.5 font-semibold">
          <input
            type="checkbox"
            role="switch"
            checked={draft.heroIsActive}
            onChange={(e) => update("heroIsActive", e.target.checked)}
            className="switch"
          />
          {h.hero.show}
        </label>
        <BannerLayoutPicker
          name="hero-layout"
          imageOnly={draft.heroImageOnly ?? false}
          textOverlay={draft.heroTextOverlay ?? false}
          onChange={(imageOnly, textOverlay) => {
            update("heroImageOnly", imageOnly);
            update("heroTextOverlay", textOverlay);
          }}
        />
        {!draft.heroImageOnly && pair("heroEyebrowVi", "heroEyebrowEn", h.hero.eyebrow)}
        {pair("heroTitleVi", "heroTitleEn", draft.heroImageOnly ? h.hero.altText : h.hero.heading)}
        {!draft.heroImageOnly && pair("heroSubtitleVi", "heroSubtitleEn", h.hero.subtitle, true)}
        {!draft.heroImageOnly && pair("heroCtaVi", "heroCtaEn", h.hero.button)}
        <BannerLinkPicker
          label={draft.heroImageOnly ? h.hero.linkImage : h.hero.link}
          productId={draft.heroProductId}
          linkUrl={draft.heroLinkUrl ?? null}
          products={products}
          invalid={badFields.includes("heroLinkUrl")}
          onChange={({ productId, linkUrl }) => {
            update("heroProductId", productId);
            update("heroLinkUrl", linkUrl);
          }}
        />
        <ImageUploadField
          kind="banner"
          value={draft.heroImageUrl}
          onChange={(url) => update("heroImageUrl", url)}
          invalid={badFields.includes("heroImageUrl")}
          saveLabel={h.save}
        />
        <BannerDesigner
          imageUrl={draft.heroImageUrl}
          texts={{ eyebrow: draft.heroEyebrowVi, title: draft.heroTitleVi, subtitle: draft.heroSubtitleVi, cta: draft.heroCtaVi }}
          look={{
            imageOnly: draft.heroImageOnly ?? false,
            textOverlay: draft.heroTextOverlay ?? false,
            textX: draft.heroTextX ?? 0,
            textY: draft.heroTextY ?? 50,
            textXMobile: draft.heroTextXMobile ?? null,
            textYMobile: draft.heroTextYMobile ?? null,
            textAlign: draft.heroTextAlign ?? "left",
            focusX: draft.heroFocusX ?? 50,
            focusY: draft.heroFocusY ?? 50,
            titleScale: draft.heroTitleScale ?? 100,
            bodyScale: draft.heroBodyScale ?? 100,
            imagePadding: draft.heroImagePadding ?? 0,
            imageWidth: draft.heroImageWidth ?? 50,
            imageSide: draft.heroImageSide ?? "right",
            splitAlign: draft.heroSplitAlign ?? "spread",
            splitGap: draft.heroSplitGap ?? 4,
          }}
          onChange={(next) =>
            setDraft((current) => ({
              ...current,
              ...("textX" in next ? { heroTextX: next.textX! } : {}),
              ...("textY" in next ? { heroTextY: next.textY! } : {}),
              ...("textXMobile" in next ? { heroTextXMobile: next.textXMobile ?? null } : {}),
              ...("textYMobile" in next ? { heroTextYMobile: next.textYMobile ?? null } : {}),
              ...("textAlign" in next ? { heroTextAlign: next.textAlign! } : {}),
              ...("focusX" in next ? { heroFocusX: next.focusX! } : {}),
              ...("focusY" in next ? { heroFocusY: next.focusY! } : {}),
              ...("titleScale" in next ? { heroTitleScale: next.titleScale! } : {}),
              ...("bodyScale" in next ? { heroBodyScale: next.bodyScale! } : {}),
              ...("imagePadding" in next ? { heroImagePadding: next.imagePadding! } : {}),
              ...("imageWidth" in next ? { heroImageWidth: next.imageWidth! } : {}),
              ...("imageSide" in next ? { heroImageSide: next.imageSide! } : {}),
              ...("splitAlign" in next ? { heroSplitAlign: next.splitAlign! } : {}),
              ...("splitGap" in next ? { heroSplitGap: next.splitGap! } : {}),
            }))
          }
        />
        <label className="flex flex-col gap-1.5 text-sm font-semibold md:max-w-xs">
          {h.hero.interval}
          <input
            type="number"
            min={3}
            max={30}
            inputMode="numeric"
            value={draft.heroIntervalSeconds}
            onChange={(e) => update("heroIntervalSeconds", Number(e.target.value))}
            className={fieldClass("heroIntervalSeconds")}
          />
          <span className="text-xs font-normal text-muted">{h.hero.intervalHint}</span>
        </label>
      </Section>
    </form>
  );
}

// How a banner looks: texts beside the photo, texts on the photo, or the photo alone.
function BannerLayoutPicker({
  name,
  imageOnly,
  textOverlay,
  onChange,
}: {
  name: string;
  imageOnly: boolean;
  textOverlay: boolean;
  onChange: (imageOnly: boolean, textOverlay: boolean) => void;
}) {
  const { t } = useAdminI18n();
  const l = t.home.layout;
  const current = imageOnly ? "image" : textOverlay ? "overlay" : "split";
  const choices = [
    { key: "split", label: l.split, hint: l.splitHint },
    { key: "overlay", label: l.overlay, hint: l.overlayHint },
    { key: "image", label: l.image, hint: l.imageHint },
  ] as const;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold">{l.title}</legend>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {choices.map((choice) => (
          <label
            key={choice.key}
            className={`flex cursor-pointer flex-col gap-1 border-[1.5px] p-3 ${current === choice.key ? "border-black bg-[#f4f4f4]" : "border-[#d4d4d4]"}`}
          >
            <span className="flex items-center gap-2 text-sm font-bold">
              <input
                type="radio"
                name={name}
                checked={current === choice.key}
                onChange={() => onChange(choice.key === "image", choice.key === "overlay")}
                className="h-4 w-4 accent-black"
              />
              {choice.label}
            </span>
            <span className="text-xs text-muted">{choice.hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---------- Extra banner slides ----------

const EMPTY_SLIDE: HeroSlideInput = {
  eyebrowVi: null,
  eyebrowEn: null,
  titleVi: "",
  titleEn: "",
  subtitleVi: null,
  subtitleEn: null,
  ctaVi: null,
  ctaEn: null,
  imageUrl: null,
  productId: null,
  imageOnly: false,
  textOverlay: false,
  textX: 0,
  textY: 50,
  textXMobile: null,
  textYMobile: null,
  textAlign: "left",
  focusX: 50,
  focusY: 50,
  titleScale: 100,
  bodyScale: 100,
  imagePadding: 0,
  imageWidth: 50,
  imageSide: "right",
  splitAlign: "spread",
  splitGap: 4,
  linkUrl: null,
  startDate: null,
  endDate: null,
  isActive: true,
  sortOrder: 0,
};

// Everything a slide save sends, with defaults for fields older slides don't have yet.
function slideInput(initial: HeroSlideInput): HeroSlideInput {
  return {
    eyebrowVi: initial.eyebrowVi,
    eyebrowEn: initial.eyebrowEn,
    titleVi: initial.titleVi,
    titleEn: initial.titleEn,
    subtitleVi: initial.subtitleVi,
    subtitleEn: initial.subtitleEn,
    ctaVi: initial.ctaVi,
    ctaEn: initial.ctaEn,
    imageUrl: initial.imageUrl,
    productId: initial.productId,
    imageOnly: initial.imageOnly ?? false,
    textOverlay: initial.textOverlay ?? false,
    textX: initial.textX ?? 0,
    textY: initial.textY ?? 50,
    textXMobile: initial.textXMobile ?? null,
    textYMobile: initial.textYMobile ?? null,
    textAlign: initial.textAlign ?? "left",
    focusX: initial.focusX ?? 50,
    focusY: initial.focusY ?? 50,
    titleScale: initial.titleScale ?? 100,
    bodyScale: initial.bodyScale ?? 100,
    imagePadding: initial.imagePadding ?? 0,
    imageWidth: initial.imageWidth ?? 50,
    imageSide: initial.imageSide ?? "right",
    splitAlign: initial.splitAlign ?? "spread",
    splitGap: initial.splitGap ?? 4,
    linkUrl: initial.linkUrl ?? null,
    startDate: initial.startDate,
    endDate: initial.endDate,
    isActive: initial.isActive,
    sortOrder: initial.sortOrder,
  };
}

function HeroSlidesSection({
  slides,
  products,
  onSaved,
}: {
  slides: AdminHeroSlide[];
  products: ProductChoice[];
  onSaved: (bundle: HomeBundle) => void;
}) {
  const { t, lang } = useAdminI18n();
  const s = t.home.slides;
  // null = list only; "new" = creating; a number = editing that slide
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const today = vietnamTodayText();

  const status = (slide: AdminHeroSlide) => {
    if (!slide.isActive) return s.status.off;
    if (slide.endDate && slide.endDate < today) return s.status.ended;
    if (slide.startDate && slide.startDate > today) return s.status.upcoming;
    return s.status.running;
  };

  return (
    <Section id="home-slides" title={s.title} hint={s.hint}>
      {slides.length === 0 && editing !== "new" && <p className="text-sm text-muted">{s.empty}</p>}
      <SortableList
        items={slides}
        getKey={(slide) => slide.id}
        disabled={editing !== null}
        onReorder={async (ordered) => onSaved(await adminApi.orderHeroSlides(ordered.map((slide) => slide.id)))}
        className="flex flex-col gap-3"
        itemClassName="border border-[#e0e0e0] bg-white"
        renderItem={(slide, handle) =>
          editing === slide.id ? (
              <HeroSlideForm initial={slide} slideId={slide.id} products={products} onSaved={onSaved} onClose={() => setEditing(null)} />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 pl-1">
                <div className="flex min-w-0 items-center gap-3">
                  {handle}
                  {slide.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- small preview
                    <img loading="lazy" decoding="async" src={slide.imageUrl} alt="" className="h-12 w-16 shrink-0 object-cover" />
                  )}
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="font-bold">
                      {(lang === "vi" ? slide.titleVi : slide.titleEn) || s.photoOnly}
                      {slide.imageOnly && slide.titleVi ? ` · ${s.photoOnly}` : ""}
                    </span>
                    <span className="text-sm text-muted">
                      {slide.startDate || slide.endDate
                        ? `${slide.startDate ?? "…"} → ${slide.endDate ?? "…"}`
                        : s.always}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <QuickSwitch
                    checked={slide.isActive}
                    disabled={editing !== null}
                    name={(lang === "vi" ? slide.titleVi : slide.titleEn) || s.photoOnly}
                    onToggle={async (isActive) => onSaved(await adminApi.updateHeroSlide(slide.id, { ...slideInput(slide), isActive }))}
                  />
                  <span
                    className={`px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${status(slide) === s.status.running ? "bg-black text-white" : "border border-black"}`}
                  >
                    {status(slide)}
                  </span>
                  <button
                    type="button"
                    disabled={editing !== null}
                    onClick={() => setEditing(slide.id)}
                    className="min-h-11 px-2 text-sm font-semibold underline disabled:opacity-40"
                  >
                    {s.edit}
                  </button>
                </div>
              </div>
            )
        }
      />
      {editing === "new" ? (
        <div className="border-[1.5px] border-black">
          <HeroSlideForm
            initial={{ ...EMPTY_SLIDE, sortOrder: slides.length + 1 }}
            slideId={null}
            products={products}
            onSaved={onSaved}
            onClose={() => setEditing(null)}
          />
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

function HeroSlideForm({
  initial,
  slideId,
  products,
  onSaved,
  onClose,
}: {
  initial: HeroSlideInput;
  slideId: number | null;
  products: ProductChoice[];
  onSaved: (bundle: HomeBundle) => void;
  onClose: () => void;
}) {
  const { t } = useAdminI18n();
  const s = t.home.slides;
  const toast = useToast();
  const handleError = useSaveErrors();
  const [draft, setDraft] = useState<HeroSlideInput>(() => slideInput(initial));
  const [start] = useState(draft); // as opened, to tell whether anything changed
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [badFields, setBadFields] = useState<string[]>([]);
  const dirty = !sameData(draft, start);
  useUnsavedGuard(dirty);
  const cancel = () => {
    if (!dirty || window.confirm(t.unsaved.leave)) onClose();
  };

  function update<K extends keyof HeroSlideInput>(key: K, value: HeroSlideInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
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
    void run(() => (slideId ? adminApi.updateHeroSlide(slideId, draft) : adminApi.createHeroSlide(draft)), t.home.saved);
  }

  const fieldClass = (field: string) =>
    `${inputBase} ${badFields.includes(field) ? "border-black bg-[#fff6f6] outline outline-2 outline-offset-1 outline-black" : "border-black"}`;

  type TextKey = "eyebrowVi" | "eyebrowEn" | "titleVi" | "titleEn" | "subtitleVi" | "subtitleEn" | "ctaVi" | "ctaEn";
  const pair = (keyVi: TextKey, keyEn: TextKey, label: string, required = false, long = false) => (
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
              value={draft[key] ?? ""}
              onChange={(e) => update(key, nullable(e.target.value) as never)}
              className={`${fieldClass(key)} h-auto py-2.5`}
            />
          ) : (
            <input
              required={required}
              value={draft[key] ?? ""}
              onChange={(e) => update(key, (required ? e.target.value : nullable(e.target.value)) as never)}
              className={fieldClass(key)}
            />
          )}
        </label>
      ))}
    </div>
  );

  return (
    <form onSubmit={save} data-savable className="flex flex-col gap-4 p-4">
      <BannerLayoutPicker
        name={`slide-layout-${slideId ?? "new"}`}
        imageOnly={draft.imageOnly}
        textOverlay={draft.textOverlay}
        onChange={(imageOnly, textOverlay) => setDraft((current) => ({ ...current, imageOnly, textOverlay }))}
      />
      {!draft.imageOnly && pair("eyebrowVi", "eyebrowEn", t.home.hero.eyebrow)}
      {pair("titleVi", "titleEn", draft.imageOnly ? t.home.hero.altText : t.home.hero.heading, !draft.imageOnly)}
      {!draft.imageOnly && pair("subtitleVi", "subtitleEn", t.home.hero.subtitle, false, true)}
      {!draft.imageOnly && pair("ctaVi", "ctaEn", t.home.hero.button)}
      <BannerLinkPicker
        label={draft.imageOnly ? t.home.hero.linkImage : t.home.hero.link}
        productId={draft.productId}
        linkUrl={draft.linkUrl}
        products={products}
        invalid={badFields.includes("linkUrl")}
        onChange={({ productId, linkUrl }) => setDraft((current) => ({ ...current, productId, linkUrl }))}
      />
      <ImageUploadField
        kind="banner"
        value={draft.imageUrl}
        onChange={(url) => update("imageUrl", url)}
        invalid={badFields.includes("imageUrl")}
        saveLabel={s.save}
      />
      <BannerDesigner
        imageUrl={draft.imageUrl}
        texts={{ eyebrow: draft.eyebrowVi, title: draft.titleVi, subtitle: draft.subtitleVi, cta: draft.ctaVi }}
        look={draft}
        onChange={(next) => setDraft((current) => ({ ...current, ...next }))}
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {s.start}
          <input
            type="date"
            value={draft.startDate ?? ""}
            onChange={(e) => update("startDate", e.target.value || null)}
            className={fieldClass("startDate")}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {s.end}
          <input
            type="date"
            value={draft.endDate ?? ""}
            onChange={(e) => update("endDate", e.target.value || null)}
            className={fieldClass("endDate")}
          />
        </label>
      </div>
      <label className="flex items-center gap-2.5 font-semibold">
        <input type="checkbox" role="switch" checked={draft.isActive} onChange={(e) => update("isActive", e.target.checked)} className="switch" />
        {s.active}
      </label>

      <div className="flex flex-wrap items-center gap-3 border-t border-[#eeeeee] pt-4">
        <SaveButton dirty={dirty} saving={busy} label={s.save} savingLabel={t.home.saving} className="text-sm" />
        <button type="button" disabled={busy} onClick={cancel} className="min-h-11 px-2 text-sm font-semibold underline">
          {s.cancel}
        </button>
        {slideId &&
          (confirmDelete ? (
            <span className="ml-auto flex flex-wrap items-center gap-2 text-sm font-semibold">
              {s.confirmDelete}
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => adminApi.deleteHeroSlide(slideId), s.deleted)}
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

function seasonInput(initial: SeasonInput): SeasonInput {
  return {
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
  };
}

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
    <Section id="home-seasons" title={s.title} hint={s.hint}>
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
                  <QuickSwitch
                    checked={season.isActive}
                    disabled={editing !== null}
                    name={lang === "vi" ? season.nameVi : season.nameEn}
                    onToggle={async (isActive) => onSaved(await adminApi.updateSeason(season.id, { ...seasonInput(season), isActive }))}
                  />
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
  const [draft, setDraft] = useState<SeasonInput>(() => seasonInput(initial));
  const [start] = useState(draft); // as opened, to tell whether anything changed
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [badFields, setBadFields] = useState<string[]>([]);
  const dirty = !sameData(draft, start);
  useUnsavedGuard(dirty);
  const cancel = () => {
    if (!dirty || window.confirm(t.unsaved.leave)) onClose();
  };

  function update<K extends keyof SeasonInput>(key: K, value: SeasonInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleProduct(id: number, checked: boolean) {
    // A newly ticked cake goes last; the order can then be changed by dragging.
    update("productIds", checked ? [...draft.productIds.filter((item) => item !== id), id] : draft.productIds.filter((item) => item !== id));
  }
  const productById = new Map(products.map((product) => [product.id, product]));

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
    <form onSubmit={save} data-savable className="flex flex-col gap-4 p-4">
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

      {draft.productIds.length > 1 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">{s.productOrder}</span>
          <span className="text-xs text-muted">{s.productOrderHint}</span>
          <SortableList
            quiet
            items={draft.productIds}
            getKey={(id) => id}
            onReorder={async (ordered) => update("productIds", ordered)}
            className="flex flex-col border border-[#e0e0e0]"
            itemClassName="flex items-center gap-2 border-b border-[#eeeeee] bg-white pr-3 last:border-b-0"
            renderItem={(id, handle) => {
              const product = productById.get(id);
              return (
                <>
                  {handle}
                  <span className="text-[15px]">{product ? (lang === "vi" ? product.nameVi : product.nameEn) : `#${id}`}</span>
                </>
              );
            }}
          />
        </div>
      )}

      <label className="flex items-center gap-2.5 font-semibold">
        <input type="checkbox" role="switch" checked={draft.isActive} onChange={(e) => update("isActive", e.target.checked)} className="switch" />
        {s.active}
      </label>

      <div className="flex flex-wrap items-center gap-3 border-t border-[#eeeeee] pt-4">
        <SaveButton dirty={dirty} saving={busy} label={s.save} savingLabel={t.home.saving} className="text-sm" />
        <button type="button" disabled={busy} onClick={cancel} className="min-h-11 px-2 text-sm font-semibold underline">
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
  const [rows, setRows] = useEditableRows(items);
  const [draft, setDraft] = useState({ dateLabel: "", nameVi: "", nameEn: "" });
  const [busy, setBusy] = useState(false);

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
    <Section id="home-coming-soon" title={c.title} hint={c.hint}>
      <SortableList
        as="div"
        items={rows}
        getKey={(row) => row.id}
        disabled={busy}
        onReorder={async (ordered) => onSaved(await adminApi.orderComingSoon(ordered.map((row) => row.id)))}
        className="flex flex-col gap-4"
        itemClassName="flex items-start gap-1 border-b border-[#eeeeee] bg-white pb-4"
        renderItem={(row, handle) => (
          <>
            <div className="pt-4">{handle}</div>
            <div className="grid flex-1 grid-cols-2 items-end gap-2 md:grid-cols-[110px_1fr_1fr_1fr_1fr]">
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
                {/* Saves at once (only the on/off; anything typed in the row still needs its Save). */}
                <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                  <QuickSwitch
                    checked={row.isActive}
                    disabled={busy}
                    name={row.nameVi}
                    onToggle={async (isActive) => {
                      const saved = items.find((item) => item.id === row.id) ?? row;
                      onSaved(await adminApi.updateComingSoon(row.id, { ...toInput(saved), isActive }));
                    }}
                  />
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
          </>
        )}
      />

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
