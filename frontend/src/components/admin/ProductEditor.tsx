"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { formatPrice } from "@/lib/format";
import { unitPrice } from "@/lib/pricing";
import {
  adminApi,
  AdminApiError,
  AdminValidationError,
  AVAILABILITIES,
  type AdminAvailability,
  type AdminCategory,
  type AdminOption,
  type AdminProduct,
  type AdminProductInput,
} from "@/lib/admin-api";
import { useAdminI18n } from "./AdminI18n";
import { AdminFormSkeleton } from "./AdminSkeletons";
import { ImageGalleryField } from "./ImageGalleryField";
import { useToast } from "./Toast";

const EMPTY_PRODUCT: AdminProductInput = {
  slug: "",
  categoryId: 0,
  nameVi: "",
  nameEn: "",
  descriptionVi: null,
  descriptionEn: null,
  ingredientsVi: null,
  ingredientsEn: null,
  allergensVi: null,
  allergensEn: null,
  images: [],
  basePrice: 0,
  soldOutUntil: null,
  dailyLimit: null,
  availability: "AVAILABLE",
  isActive: true,
  isNew: false,
  sortOrder: 0,
  options: [],
};

function toInput(product: AdminProduct): AdminProductInput {
  return {
    slug: product.slug,
    categoryId: product.category.id,
    nameVi: product.nameVi,
    nameEn: product.nameEn,
    descriptionVi: product.descriptionVi,
    descriptionEn: product.descriptionEn,
    ingredientsVi: product.ingredientsVi,
    ingredientsEn: product.ingredientsEn,
    allergensVi: product.allergensVi,
    allergensEn: product.allergensEn,
    images: product.images,
    basePrice: product.basePrice,
    soldOutUntil: product.soldOutUntil,
    dailyLimit: product.dailyLimit,
    availability: product.availability,
    isActive: product.isActive,
    isNew: product.isNew,
    sortOrder: product.sortOrder,
    options: product.options.map(({ id, type, nameVi, nameEn, priceDelta, portions, isActive, availability, sortOrder }) => ({
      id,
      type,
      nameVi,
      nameEn,
      priceDelta,
      portions,
      isActive,
      availability,
      sortOrder,
    })),
  };
}

// Turns a product name into a URL-safe slug, e.g. "Passion Fruit Mousse" -> "passion-fruit-mousse".
// Accented letters are reduced to plain ASCII letters.
function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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

export function ProductEditor() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = Number(searchParams.get("id")) || null;
  const { t, lang } = useAdminI18n();
  const e = t.products.editor;

  const [form, setForm] = useState<AdminProductInput | null>(productId ? null : EMPTY_PRODUCT);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [slugTouched, setSlugTouched] = useState(Boolean(productId));
  const [saving, setSaving] = useState(false);
  const [badFields, setBadFields] = useState<string[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const loads: Promise<unknown>[] = [adminApi.listCategories().then(setCategories)];
    if (productId) {
      loads.push(adminApi.getProduct(productId).then((product) => setForm(toInput(product))));
    }
    Promise.all(loads).catch((error: unknown) => {
      if (error instanceof AdminApiError && error.status === 401) {
        router.replace("/admin/login");
        return;
      }
      setLoadFailed(true);
    });
  }, [productId, router]);

  if (!form) {
    return loadFailed ? (
      <p role="alert" className="border-[1.5px] border-black bg-white p-4 font-semibold">
        {e.unknownError}
      </p>
    ) : (
      <AdminFormSkeleton label={e.loading} />
    );
  }

  function update<K extends keyof AdminProductInput>(key: K, value: AdminProductInput[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function updateOption(index: number, change: Partial<AdminOption>) {
    setForm((current) =>
      current ? { ...current, options: current.options.map((o, i) => (i === index ? { ...o, ...change } : o)) } : current,
    );
  }

  function addOption(type: AdminOption["type"]) {
    setForm((current) =>
      current
        ? {
            ...current,
            options: [
              ...current.options,
              { type, nameVi: "", nameEn: "", priceDelta: 0, portions: 1, isActive: true, availability: "AVAILABLE", sortOrder: current.options.length + 1 },
            ],
          }
        : current,
    );
  }

  function removeOption(index: number) {
    setForm((current) => (current ? { ...current, options: current.options.filter((_, i) => i !== index) } : current));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setBadFields([]);
    try {
      const saved = productId ? await adminApi.updateProduct(productId, form) : await adminApi.createProduct(form);
      setForm(toInput(saved));
      toast.success(e.saved);
      if (!productId) {
        router.replace(`/admin/products/edit?id=${saved.id}`);
      }
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (error instanceof AdminValidationError) {
        setBadFields(error.fields);
        toast.error(e.invalid);
      } else if (error instanceof AdminApiError && error.code === "SLUG_TAKEN") {
        setBadFields(["slug"]);
        toast.error(e.slugTaken);
      } else {
        toast.error(e.unknownError);
      }
    } finally {
      setSaving(false);
    }
  }

  const isBad = (field: string) => badFields.some((f) => f === field || f.startsWith(`${field}.`));
  const inputClass = (field: string) =>
    `h-11 w-full border-[1.5px] bg-white px-3 text-[15px] font-normal ${isBad(field) ? "border-black bg-[#fff6f6] outline outline-2 outline-offset-1 outline-black" : "border-black"}`;
  const areaClass = (field: string) => `${inputClass(field)} h-auto py-2.5`;
  const textValue = (value: string | null) => value ?? "";
  const nullable = (value: string) => (value.trim() === "" ? null : value);

  const flavors = form.options.map((o, i) => ({ o, i })).filter(({ o }) => o.type === "FLAVOR");
  const packages = form.options.map((o, i) => ({ o, i })).filter(({ o }) => o.type === "PACKAGE");
  const firstFlavor = flavors.find(({ o }) => o.isActive)?.o ?? null;

  const optionRows = (rows: { o: AdminOption; i: number }[], kind: AdminOption["type"]) =>
    rows.map(({ o, i }) => (
      <div key={o.id ?? `new-${i}`} className="grid grid-cols-2 items-end gap-2 border-b border-[#eeeeee] pb-3 md:grid-cols-[1fr_1fr_110px_90px_140px_auto_auto]">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          {e.optionNameVi}
          <input value={o.nameVi} onChange={(ev) => updateOption(i, { nameVi: ev.target.value })} className={inputClass(`options.${i}.nameVi`)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          {e.optionNameEn}
          <input value={o.nameEn} onChange={(ev) => updateOption(i, { nameEn: ev.target.value })} className={inputClass(`options.${i}.nameEn`)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          {kind === "FLAVOR" ? e.extraPrice : e.adjustment}
          <input
            type="number"
            step={1000}
            value={o.priceDelta}
            onChange={(ev) => updateOption(i, { priceDelta: Number(ev.target.value) })}
            className={inputClass(`options.${i}.priceDelta`)}
          />
        </label>
        {kind === "PACKAGE" ? (
          <label className="flex flex-col gap-1 text-xs font-semibold">
            {e.portions}
            <input
              type="number"
              min={1}
              value={o.portions}
              onChange={(ev) => updateOption(i, { portions: Number(ev.target.value) })}
              className={inputClass(`options.${i}.portions`)}
            />
          </label>
        ) : (
          <span className="hidden md:block" />
        )}
        <label className="flex flex-col gap-1 text-xs font-semibold">
          {e.availability}
          <select
            value={o.availability}
            onChange={(ev) => updateOption(i, { availability: ev.target.value as AdminAvailability })}
            className={inputClass(`options.${i}.availability`)}
          >
            {AVAILABILITIES.map((value) => (
              <option key={value} value={value}>
                {t.availability[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={o.isActive} onChange={(ev) => updateOption(i, { isActive: ev.target.checked })} className="h-5 w-5 accent-black" />
          {e.active}
        </label>
        <button type="button" onClick={() => removeOption(i)} className="h-11 text-sm font-semibold underline">
          {e.remove}
        </button>
      </div>
    ));

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#e0e0e0] bg-[#fafafa]/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <div className="flex flex-col gap-1">
          <Link href="/admin/products" className="self-start py-1 text-sm font-semibold">
            {e.back}
          </Link>
          <h1 className="font-display text-3xl uppercase md:text-[40px]">{productId ? e.editTitle : e.createTitle}</h1>
        </div>
        <button type="submit" disabled={saving} className="min-h-11 bg-black px-6 font-bold text-white hover:bg-[#333333] disabled:opacity-60">
          {saving ? e.saving : e.save}
        </button>
      </div>

      <Section title={e.basics}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {e.nameVi}
            <input
              required
              value={form.nameVi}
              onChange={(ev) => update("nameVi", ev.target.value)}
              className={inputClass("nameVi")}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {e.nameEn}
            <input
              required
              value={form.nameEn}
              onChange={(ev) => {
                update("nameEn", ev.target.value);
                if (!slugTouched) update("slug", slugify(ev.target.value));
              }}
              className={inputClass("nameEn")}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {e.slug}
            <input
              required
              value={form.slug}
              onChange={(ev) => {
                setSlugTouched(true);
                update("slug", ev.target.value);
              }}
              className={inputClass("slug")}
            />
            <span className="text-xs font-normal text-muted">{e.slugHint}</span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {e.category}
            <select
              required
              value={form.categoryId || ""}
              onChange={(ev) => update("categoryId", Number(ev.target.value))}
              className={inputClass("categoryId")}
            >
              <option value="" disabled>
                {e.chooseCategory}
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {lang === "vi" ? category.nameVi : category.nameEn}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {e.basePrice}
            <input
              required
              type="number"
              min={0}
              step={1000}
              value={form.basePrice}
              onChange={(ev) => update("basePrice", Number(ev.target.value))}
              className={inputClass("basePrice")}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {e.order}
            <input
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(ev) => update("sortOrder", Number(ev.target.value))}
              className={inputClass("sortOrder")}
            />
          </label>
        </div>
        <label className="flex max-w-sm flex-col gap-1.5 text-sm font-semibold">
          {e.availabilityProduct}
          <select
            value={form.availability}
            onChange={(ev) => update("availability", ev.target.value as AdminAvailability)}
            className={inputClass("availability")}
          >
            {AVAILABILITIES.map((value) => (
              <option key={value} value={value}>
                {t.availability[value]}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-muted">{e.availabilityHint}</span>
        </label>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2.5 font-semibold">
            <input type="checkbox" checked={form.isActive} onChange={(ev) => update("isActive", ev.target.checked)} className="h-5 w-5 accent-black" />
            {e.visible}
          </label>
          <label className="flex items-center gap-2.5 font-semibold">
            <input type="checkbox" checked={form.isNew} onChange={(ev) => update("isNew", ev.target.checked)} className="h-5 w-5 accent-black" />
            {e.isNew}
          </label>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5 text-sm font-semibold">
            <label htmlFor="sold-out-until">{e.soldOutUntil}</label>
            <div className="flex gap-2">
              <input
                id="sold-out-until"
                type="date"
                value={form.soldOutUntil ?? ""}
                onChange={(ev) => update("soldOutUntil", ev.target.value || null)}
                className={inputClass("soldOutUntil")}
              />
              {form.soldOutUntil && (
                <button type="button" onClick={() => update("soldOutUntil", null)} className="shrink-0 px-2 text-sm font-semibold underline">
                  {e.clear}
                </button>
              )}
            </div>
            <span className="text-xs font-normal text-muted">{e.soldOutHint}</span>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {e.dailyLimit}
            <input
              type="number"
              min={1}
              value={form.dailyLimit ?? ""}
              onChange={(ev) => update("dailyLimit", ev.target.value === "" ? null : Number(ev.target.value))}
              className={inputClass("dailyLimit")}
            />
            <span className="text-xs font-normal text-muted">{e.dailyLimitHint}</span>
          </label>
        </div>
        <ImageGalleryField
          value={form.images}
          onChange={(images) => update("images", images)}
          invalid={isBad("images")}
          saveLabel={e.save}
        />
      </Section>

      <Section title={e.texts}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(
            [
              ["descriptionVi", e.descriptionVi, 4],
              ["descriptionEn", e.descriptionEn, 4],
              ["ingredientsVi", e.ingredientsVi, 3],
              ["ingredientsEn", e.ingredientsEn, 3],
              ["allergensVi", e.allergensVi, 2],
              ["allergensEn", e.allergensEn, 2],
            ] as const
          ).map(([key, label, rows]) => (
            <label key={key} className="flex flex-col gap-1.5 text-sm font-semibold">
              {label}
              <textarea
                rows={rows}
                value={textValue(form[key])}
                onChange={(ev) => update(key, nullable(ev.target.value))}
                className={areaClass(key)}
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-muted">{e.allergensHint}</p>
      </Section>

      <Section title={e.flavorsTitle} hint={e.flavorsHint}>
        {optionRows(flavors, "FLAVOR")}
        <button type="button" onClick={() => addOption("FLAVOR")} className="self-start border-[1.5px] border-black px-4 py-2.5 text-sm font-bold">
          + {e.addFlavor}
        </button>
      </Section>

      <Section title={e.packagesTitle} hint={e.packagesHint}>
        {optionRows(packages, "PACKAGE")}
        <button type="button" onClick={() => addOption("PACKAGE")} className="self-start border-[1.5px] border-black px-4 py-2.5 text-sm font-bold">
          + {e.addSize}
        </button>
        {packages.some(({ o }) => o.isActive) && (
          <div className="flex flex-col gap-1.5 bg-surface p-4 text-sm">
            <span className="font-bold">{e.pricePreview}</span>
            {packages
              .filter(({ o }) => o.isActive)
              .map(({ o, i }) => (
                <span key={o.id ?? `preview-${i}`}>
                  {(lang === "vi" ? o.nameVi : o.nameEn) || "—"}: {formatPrice(unitPrice(form.basePrice, firstFlavor, o), lang)}
                </span>
              ))}
          </div>
        )}
        <p className="text-xs text-muted">{e.removeHint}</p>
      </Section>
    </form>
  );
}
