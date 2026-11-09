"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";
import {
  adminApi,
  AdminApiError,
  AVAILABILITIES,
  type AdminAvailability,
  type AdminCategory,
  type AdminProduct,
} from "@/lib/admin-api";
import { useAdminMe } from "./AdminShell";
import { useAdminI18n } from "./AdminI18n";
import { AdminCardsSkeleton } from "./AdminSkeletons";
import { useToast } from "./Toast";

export function ProductsPage() {
  const router = useRouter();
  const { t } = useAdminI18n();
  const me = useAdminMe();
  const isAdmin = me?.role === "ADMIN";
  const p = t.products;
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const [productList, categoryList] = await Promise.all([adminApi.listProducts(), adminApi.listCategories()]);
      setProducts(productList);
      setCategories(categoryList);
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) {
        router.replace("/admin/login");
        return;
      }
      setLoadFailed(true);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadFailed) {
    return <p className="border-[1.5px] border-black bg-white p-4 font-semibold">{p.loadError}</p>;
  }
  if (!products) {
    return <AdminCardsSkeleton label={p.loading} />;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl uppercase md:text-[40px]">{p.title}</h1>
        {isAdmin && (
          <Link href="/admin/products/edit" className="flex min-h-11 items-center bg-black px-5 font-bold text-white">
            {p.newProduct}
          </Link>
        )}
      </div>
      {!isAdmin && <p className="-mt-4 text-sm text-muted">{p.stock.staffHint}</p>}

      {products.length === 0 ? (
        <p className="border border-dashed border-[#a8a8a8] bg-white p-7 text-center text-muted">{p.empty}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) =>
            isAdmin ? (
              <li key={product.id}>
                <Link
                  href={`/admin/products/edit?id=${product.id}`}
                  className={`flex gap-4 border bg-white p-4 hover:border-black ${product.isActive ? "border-[#e0e0e0]" : "border-dashed border-[#a8a8a8] opacity-70"}`}
                >
                  <ProductSummary product={product} />
                  <span className="self-center text-sm font-semibold underline">{p.edit}</span>
                </Link>
              </li>
            ) : (
              <li
                key={product.id}
                className={`flex flex-col gap-4 border bg-white p-4 ${product.isActive ? "border-[#e0e0e0]" : "border-dashed border-[#a8a8a8] opacity-70"}`}
              >
                <div className="flex gap-4">
                  <ProductSummary product={product} />
                </div>
                <StockEditor
                  product={product}
                  onSaved={(saved) => setProducts((list) => list?.map((item) => (item.id === saved.id ? saved : item)) ?? null)}
                />
              </li>
            ),
          )}
        </ul>
      )}

      {isAdmin && <CategoriesSection categories={categories} onChanged={load} />}
    </div>
  );
}

function ProductSummary({ product }: { product: AdminProduct }) {
  const { t, lang } = useAdminI18n();
  const p = t.products;
  const flavorCount = product.options.filter((o) => o.type === "FLAVOR" && o.isActive).length;
  return (
    <>
      <div className="flex h-20 w-20 shrink-0 items-center justify-center bg-surface text-[11px] text-muted">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail
          <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          "—"
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs font-bold uppercase tracking-wider text-muted">
          {lang === "vi" ? product.category.nameVi : product.category.nameEn}
        </span>
        <span className="font-bold">{lang === "vi" ? product.nameVi : product.nameEn}</span>
        <span className="text-sm">
          {p.from} {formatPrice(product.basePrice, lang)}
          {flavorCount > 0 ? ` · ${p.flavors.replace("{count}", String(flavorCount))}` : ""}
        </span>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {product.isNew && (
            <span className="bg-black px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{p.new}</span>
          )}
          {product.availability !== "AVAILABLE" && (
            <span className="border border-black bg-black px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              {t.availability[product.availability]}
            </span>
          )}
          {product.options
            .filter((option) => option.isActive && option.availability !== "AVAILABLE")
            .map((option) => (
              <span key={option.id} className="border border-black px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                {lang === "vi" ? option.nameVi : option.nameEn}: {t.availability[option.availability]}
              </span>
            ))}
          {product.soldOutUntil && (
            <span className="border border-black px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              {p.soldOutUntil.replace("{date}", product.soldOutUntil)}
            </span>
          )}
          {product.dailyLimit && (
            <span className="border border-[#a8a8a8] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
              {p.limit.replace("{count}", String(product.dailyLimit))}
            </span>
          )}
          {product.options
            .filter((option) => option.isActive && option.type === "FLAVOR" && option.dailyLimit)
            .map((option) => (
              <span
                key={`limit-${option.id}`}
                className="border border-[#a8a8a8] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted"
              >
                {p.flavorLimit
                  .replace("{name}", lang === "vi" ? option.nameVi : option.nameEn)
                  .replace("{count}", String(option.dailyLimit))}
              </span>
            ))}
          {!product.isActive && (
            <span className="border border-black px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">{p.hidden}</span>
          )}
        </div>
      </div>
    </>
  );
}

// Staff view: only "sold out until" and "daily limit" can be changed.
function StockEditor({ product, onSaved }: { product: AdminProduct; onSaved: (product: AdminProduct) => void }) {
  const router = useRouter();
  const toast = useToast();
  const { t, lang } = useAdminI18n();
  const e = t.products.editor;
  const [soldOutUntil, setSoldOutUntil] = useState(product.soldOutUntil ?? "");
  const [dailyLimit, setDailyLimit] = useState(product.dailyLimit ? String(product.dailyLimit) : "");
  const [availability, setAvailability] = useState<AdminAvailability>(product.availability);
  // Options shown to customers; saved options always have an id.
  const activeOptions = product.options.flatMap((option) =>
    option.isActive && option.id !== undefined ? [{ ...option, id: option.id }] : [],
  );
  const [optionAvailability, setOptionAvailability] = useState<Record<number, AdminAvailability>>(() =>
    Object.fromEntries(activeOptions.map((option) => [option.id, option.availability])),
  );
  // Each flavor's own daily limit, as typed ("" = no limit)
  const [flavorLimits, setFlavorLimits] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      activeOptions.filter((o) => o.type === "FLAVOR").map((o) => [o.id, o.dailyLimit ? String(o.dailyLimit) : ""]),
    ),
  );
  const toLimit = (text: string) => (text.trim() === "" ? null : Number(text));
  const isValidLimit = (value: number | null) => value === null || (Number.isInteger(value) && value >= 1);
  const flavorLimitsValid = Object.values(flavorLimits).every((text) => isValidLimit(toLimit(text)));
  const [busy, setBusy] = useState(false);

  const limitNumber = dailyLimit.trim() === "" ? null : Number(dailyLimit);
  const limitValid = limitNumber === null || (Number.isInteger(limitNumber) && limitNumber >= 1);

  async function save() {
    setBusy(true);
    try {
      onSaved(
        await adminApi.updateStock(product.id, {
          soldOutUntil: soldOutUntil || null,
          dailyLimit: limitNumber,
          availability,
          options: Object.entries(optionAvailability).map(([id, value]) => ({
            id: Number(id),
            availability: value,
            ...(Number(id) in flavorLimits ? { dailyLimit: toLimit(flavorLimits[Number(id)]) } : {}),
          })),
        }),
      );
      toast.success(t.products.stock.saved);
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) {
        router.replace("/admin/login");
        return;
      }
      toast.error(error instanceof AdminApiError && error.code === "VALIDATION_ERROR" ? e.invalid : e.unknownError);
    } finally {
      setBusy(false);
    }
  }

  const cell = "h-11 w-full border-[1.5px] border-black bg-white px-3 text-[15px] font-normal";

  return (
    <div className="flex flex-col gap-3 border-t border-[#eeeeee] pt-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold">
          {e.availabilityProduct}
          <select value={availability} onChange={(ev) => setAvailability(ev.target.value as AdminAvailability)} className={cell}>
            {AVAILABILITIES.map((value) => (
              <option key={value} value={value}>
                {t.availability[value]}
              </option>
            ))}
          </select>
        </label>
        {activeOptions.map((option) => (
          <div key={option.id} className="flex flex-col gap-1.5">
            <label className="flex flex-col gap-1.5 text-xs font-semibold">
              {(option.type === "FLAVOR" ? e.flavorLabel : e.sizeLabel).replace("{name}", lang === "vi" ? option.nameVi : option.nameEn)}
              <select
                value={optionAvailability[option.id] ?? "AVAILABLE"}
                onChange={(ev) => setOptionAvailability((current) => ({ ...current, [option.id]: ev.target.value as AdminAvailability }))}
                className={cell}
              >
                {AVAILABILITIES.map((value) => (
                  <option key={value} value={value}>
                    {t.availability[value]}
                  </option>
                ))}
              </select>
            </label>
            {option.type === "FLAVOR" && (
              <label className="flex flex-col gap-1.5 text-xs font-semibold">
                {e.flavorDailyLimit}
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder={t.products.stock.unlimited}
                  value={flavorLimits[option.id] ?? ""}
                  onChange={(ev) => setFlavorLimits((current) => ({ ...current, [option.id]: ev.target.value }))}
                  className={cell}
                />
              </label>
            )}
          </div>
        ))}
      </div>
    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
      <label className="flex flex-col gap-1.5 text-xs font-semibold">
        {e.soldOutUntil}
        <div className="flex gap-1">
          <input type="date" value={soldOutUntil} onChange={(ev) => setSoldOutUntil(ev.target.value)} className={cell} />
          {soldOutUntil && (
            <button type="button" onClick={() => setSoldOutUntil("")} className="px-2 text-xs font-semibold underline">
              {e.clear}
            </button>
          )}
        </div>
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-semibold">
        {e.dailyLimit}
        <input
          type="number"
          min={1}
          inputMode="numeric"
          placeholder={t.products.stock.unlimited}
          value={dailyLimit}
          onChange={(ev) => setDailyLimit(ev.target.value)}
          className={cell}
        />
      </label>
      <button type="button" disabled={busy || !limitValid || !flavorLimitsValid} onClick={save} className="h-11 bg-black px-5 text-sm font-bold text-white disabled:opacity-50">
        {t.products.stock.save}
      </button>
    </div>
    </div>
  );
}

function CategoriesSection({ categories, onChanged }: { categories: AdminCategory[]; onChanged: () => Promise<void> }) {
  const router = useRouter();
  const { t } = useAdminI18n();
  const c = t.products.categories;
  const [rows, setRows] = useState(categories);
  const [draft, setDraft] = useState({ slug: "", nameVi: "", nameEn: "" });
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => setRows(categories), [categories]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await onChanged();
      toast.success(c.saved);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const code = err instanceof AdminApiError ? err.code : "UNKNOWN";
      toast.error(
        code === "SLUG_TAKEN"
          ? t.products.editor.slugTaken
          : code === "VALIDATION_ERROR"
            ? t.products.editor.invalid
            : t.products.editor.unknownError,
      );
    } finally {
      setBusy(false);
    }
  }

  const cell = "h-11 w-full border-[1.5px] border-black bg-white px-3 text-[15px]";

  return (
    <section id="products-categories" className="flex scroll-mt-6 flex-col gap-4 border border-[#e0e0e0] bg-white p-5 md:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl uppercase tracking-wide">{c.title}</h2>
        <p className="text-sm text-muted">{c.hint}</p>
      </div>
      {rows.map((row) => (
        <div key={row.id} className="grid grid-cols-2 items-end gap-2 border-b border-[#eeeeee] pb-3 md:grid-cols-[1fr_1fr_1fr_80px_auto]">
          <label className="flex flex-col gap-1 text-xs font-semibold">
            {c.slug}
            <input value={row.slug} onChange={(e) => setRows(rows.map((r) => (r.id === row.id ? { ...r, slug: e.target.value } : r)))} className={cell} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            {c.nameVi}
            <input value={row.nameVi} onChange={(e) => setRows(rows.map((r) => (r.id === row.id ? { ...r, nameVi: e.target.value } : r)))} className={cell} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            {c.nameEn}
            <input value={row.nameEn} onChange={(e) => setRows(rows.map((r) => (r.id === row.id ? { ...r, nameEn: e.target.value } : r)))} className={cell} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            {c.order}
            <input
              type="number"
              min={0}
              value={row.sortOrder}
              onChange={(e) => setRows(rows.map((r) => (r.id === row.id ? { ...r, sortOrder: Number(e.target.value) } : r)))}
              className={cell}
            />
          </label>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">
              {row._count?.products ?? 0} {c.products}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => adminApi.updateCategory(row))}
              className="h-11 border-[1.5px] border-black px-4 text-sm font-bold disabled:opacity-60"
            >
              {c.save}
            </button>
          </div>
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await adminApi.createCategory({ ...draft, sortOrder: rows.length + 1 });
            setDraft({ slug: "", nameVi: "", nameEn: "" });
          });
        }}
        className="grid grid-cols-2 items-end gap-2 md:grid-cols-[1fr_1fr_1fr_auto]"
      >
        <label className="flex flex-col gap-1 text-xs font-semibold">
          {c.slug}
          <input required value={draft.slug} placeholder="cheesecake" onChange={(e) => setDraft({ ...draft, slug: e.target.value })} className={cell} />
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
    </section>
  );
}
