"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  adminApi,
  AdminApiError,
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
  type ExpenseFilters,
  type ExpenseInput,
  type ExpenseList,
} from "@/lib/admin-api";
import { formatPrice } from "@/lib/format";
import { vietnamTodayText } from "@/lib/shop-date";
import { useAdminI18n } from "./AdminI18n";
import { useAdminMe } from "./AdminShell";
import { AdminRowsSkeleton } from "./AdminSkeletons";
import { useToast } from "./Toast";

const MAX_PHOTOS = 6; // same limit as the server
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

// "2026-11-08" -> "08/11/2026"
function showDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function monthStart(today: string): string {
  return `${today.slice(0, 8)}01`;
}

// The shop's costs: every shopping trip or bill, with photos of the receipt and of what was bought.
export function ExpensesPage() {
  const router = useRouter();
  const toast = useToast();
  const me = useAdminMe();
  const { t, lang } = useAdminI18n();
  const x = t.expenses;
  const today = vietnamTodayText();
  const [filters, setFilters] = useState<ExpenseFilters>({ from: monthStart(today), to: today, page: 1 });
  const [data, setData] = useState<ExpenseList | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await adminApi.listExpenses(filters));
      setFailed(false);
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) {
        router.replace("/admin/login");
        return;
      }
      setFailed(true);
    }
  }, [filters, router]);

  useEffect(() => {
    void load();
  }, [load]);

  function set<K extends keyof ExpenseFilters>(key: K, value: ExpenseFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value, page: key === "page" ? (value as number) : 1 }));
  }

  async function remove(expense: Expense) {
    if (!window.confirm(x.deleteConfirm.replace("{title}", expense.title))) return;
    try {
      await adminApi.deleteExpense(expense.id);
      toast.success(x.deleted);
      await load();
    } catch {
      toast.error(x.error);
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      await adminApi.exportExpenses(filters);
    } catch {
      toast.error(x.error);
    } finally {
      setExporting(false);
    }
  }

  const money = (amount: number) => formatPrice(amount, lang);
  const pages = data ? Math.max(1, Math.ceil(data.count / data.pageSize)) : 1;
  const page = filters.page ?? 1;
  const control = "h-10 border-[1.5px] border-black bg-white px-2.5 text-sm font-normal";

  if (editing) {
    return (
      <ExpenseForm
        expense={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    );
  }

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl uppercase md:text-[40px]">{x.title}</h1>
          <p className="text-sm text-muted">{x.hint}</p>
          {me?.role === "ADMIN" && (
            <Link href="/admin/stats" className="text-sm font-semibold underline">
              {x.seeProfit} →
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {me?.role === "ADMIN" && (
            <button
              type="button"
              onClick={exportCsv}
              disabled={exporting || !data || data.count === 0}
              className="min-h-11 border-[1.5px] border-black bg-white px-4 text-sm font-bold disabled:opacity-50"
            >
              {exporting ? x.exporting : x.export}
            </button>
          )}
          <button type="button" onClick={() => setEditing("new")} className="min-h-11 bg-black px-5 text-sm font-bold text-white">
            + {x.add}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 border border-[#e0e0e0] bg-white p-4">
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          {x.from}
          <input type="date" value={filters.from ?? ""} onChange={(e) => set("from", e.target.value || undefined)} className={control} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          {x.to}
          <input type="date" value={filters.to ?? ""} onChange={(e) => set("to", e.target.value || undefined)} className={control} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          {x.category}
          <select
            value={filters.category ?? ""}
            onChange={(e) => set("category", (e.target.value || undefined) as ExpenseCategory | undefined)}
            className={control}
          >
            <option value="">{x.allCategories}</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {x.categories[c]}
              </option>
            ))}
          </select>
        </label>
        {data && (
          <p className="ml-auto text-sm font-semibold" aria-live="polite">
            {x.summary.replace("{count}", String(data.count)).replace("{total}", money(data.total))}
          </p>
        )}
      </div>

      {failed && <p className="border-[1.5px] border-black bg-white p-4 font-semibold">{x.loadError}</p>}
      {!data && !failed && <AdminRowsSkeleton label={x.loading} />}
      {data && data.expenses.length === 0 && (
        <p className="border border-dashed border-[#a8a8a8] bg-white p-7 text-center text-muted">{x.empty}</p>
      )}

      {data && data.expenses.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {data.expenses.map((expense) => (
            <li key={expense.id} className="flex flex-col gap-2 border border-[#e0e0e0] bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm text-muted">{showDate(expense.spentOn)}</span>
                  <span className="font-bold">{expense.title}</span>
                  <span className="border border-black px-1.5 text-[10px] font-bold uppercase tracking-wider">
                    {x.categories[expense.category]}
                  </span>
                </span>
                <span className="text-lg font-bold">{money(expense.amount)}</span>
              </div>
              {expense.note && <p className="whitespace-pre-line text-sm text-[#333333]">{expense.note}</p>}
              {expense.photos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {expense.photos.map((url, i) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer" aria-label={x.openPhoto.replace("{n}", String(i + 1))}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- receipt photo */}
                      <img src={url} alt="" loading="lazy" className="h-16 w-16 border border-[#e0e0e0] object-cover" />
                    </a>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>{expense.createdBy ? x.by.replace("{name}", expense.createdBy) : ""}</span>
                {expense.canEdit && (
                  <span className="flex gap-3">
                    <button type="button" onClick={() => setEditing(expense)} className="min-h-9 text-sm font-semibold text-black underline">
                      {x.edit}
                    </button>
                    <button type="button" onClick={() => remove(expense)} className="min-h-9 text-sm font-semibold text-black underline">
                      {x.delete}
                    </button>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && pages > 1 && (
        <nav className="flex items-center justify-between gap-3 text-sm font-bold">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => set("page", page - 1)}
            className="min-h-10 border-[1.5px] border-black bg-white px-4 disabled:opacity-40"
          >
            ← {x.prev}
          </button>
          <span>{x.pageOf.replace("{page}", String(page)).replace("{pages}", String(pages))}</span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => set("page", page + 1)}
            className="min-h-10 border-[1.5px] border-black bg-white px-4 disabled:opacity-40"
          >
            {x.next} →
          </button>
        </nav>
      )}
    </div>
  );
}

// Add or change one cost, with its photos.
function ExpenseForm({ expense, onClose, onSaved }: { expense: Expense | null; onClose: () => void; onSaved: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { t, lang } = useAdminI18n();
  const x = t.expenses;
  const [draft, setDraft] = useState<ExpenseInput>(
    expense
      ? {
          spentOn: expense.spentOn,
          title: expense.title,
          amount: expense.amount,
          category: expense.category,
          note: expense.note,
          photos: expense.photos,
        }
      : { spentOn: vietnamTodayText(), title: "", amount: 0, category: "INGREDIENT", note: null, photos: [] },
  );
  const [amountText, setAmountText] = useState(expense ? String(expense.amount) : "");
  const [uploading, setUploading] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photosRef = useRef(draft.photos); // newest list while several photos finish one by one
  const fileInput = useRef<HTMLInputElement>(null);

  function update<K extends keyof ExpenseInput>(key: K, value: ExpenseInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setPhotos(photos: string[]) {
    photosRef.current = photos;
    update("photos", photos);
  }

  async function addFiles(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => PHOTO_TYPES.includes(f.type) && f.size <= MAX_PHOTO_BYTES);
    if (files.length < (list?.length ?? 0)) toast.error(t.images.someSkipped);
    const room = MAX_PHOTOS - photosRef.current.length;
    if (files.length > room) toast.error(x.tooManyPhotos.replace("{max}", String(MAX_PHOTOS)));
    const queue = files.slice(0, Math.max(0, room));
    for (const file of queue) {
      setUploading((n) => n + 1);
      try {
        const { url } = await adminApi.uploadExpensePhoto(file);
        setPhotos([...photosRef.current, url]);
      } catch (err) {
        if (err instanceof AdminApiError && err.status === 401) {
          router.replace("/admin/login");
          return;
        }
        toast.error(`${file.name}: ${t.images.failed}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(amountText.replace(/[^\d]/g, ""));
    if (!draft.title.trim() || !Number.isInteger(amount) || amount <= 0) {
      setError(x.invalid);
      return;
    }
    const input: ExpenseInput = { ...draft, title: draft.title.trim(), amount, note: draft.note?.trim() || null };
    setSaving(true);
    setError(null);
    try {
      if (expense) await adminApi.updateExpense(expense.id, input);
      else await adminApi.createExpense(input);
      toast.success(x.saved);
      onSaved();
    } catch (err) {
      setError(err instanceof AdminApiError && err.code === "FORBIDDEN" ? x.forbidden : x.error);
    } finally {
      setSaving(false);
    }
  }

  const field = "flex flex-col gap-1.5 text-sm font-semibold";
  const input = "h-12 border-[1.5px] border-black bg-white px-3 text-[16px] font-normal";
  const amountPreview = Number(amountText.replace(/[^\d]/g, ""));

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl uppercase">{expense ? x.editTitle : x.addTitle}</h1>
        <button type="button" onClick={onClose} className="min-h-11 border-[1.5px] border-black px-4 font-semibold">
          ← {x.back}
        </button>
      </div>

      <div className="flex flex-col gap-4 border border-[#e0e0e0] bg-white p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={field}>
            {x.date}
            <input type="date" required value={draft.spentOn} max={vietnamTodayText()} onChange={(e) => update("spentOn", e.target.value)} className={input} />
          </label>
          <label className={field}>
            {x.category}
            <select value={draft.category} onChange={(e) => update("category", e.target.value as ExpenseCategory)} className={input}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {x.categories[c]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={field}>
          {x.titleLabel}
          <input
            required
            maxLength={120}
            value={draft.title}
            placeholder={x.titlePlaceholder}
            onChange={(e) => update("title", e.target.value)}
            className={input}
          />
        </label>
        <label className={field}>
          {x.amount}
          <input
            required
            inputMode="numeric"
            value={amountText}
            placeholder="250000"
            onChange={(e) => setAmountText(e.target.value)}
            className={input}
          />
          {amountPreview > 0 && <span className="text-xs font-normal text-muted">= {formatPrice(amountPreview, lang)}</span>}
        </label>
        <label className={field}>
          {x.note}
          <textarea
            rows={4}
            maxLength={2000}
            value={draft.note ?? ""}
            placeholder={x.notePlaceholder}
            onChange={(e) => update("note", e.target.value)}
            className="border-[1.5px] border-black bg-white px-3 py-2.5 text-[16px] font-normal"
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">{x.photos}</span>
          <span className="text-xs text-muted">{x.photosHint.replace("{max}", String(MAX_PHOTOS))}</span>
          <div className="flex flex-wrap gap-2">
            {draft.photos.map((url, i) => (
              <div key={url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- receipt photo preview */}
                <img src={url} alt={x.openPhoto.replace("{n}", String(i + 1))} className="h-24 w-24 border border-[#e0e0e0] object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos(photosRef.current.filter((u) => u !== url))}
                  aria-label={x.removePhoto}
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center bg-black text-white"
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2.5" />
                  </svg>
                </button>
              </div>
            ))}
            {draft.photos.length < MAX_PHOTOS && (
              <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 border-[1.5px] border-dashed border-black text-center text-xs font-bold">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M3 8h4l2-3h6l2 3h4v11H3z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
                {uploading > 0 ? t.images.uploading : x.addPhoto}
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="sr-only"
                  onChange={(e) => void addFiles(e.target.files)}
                />
              </label>
            )}
          </div>
        </div>

        {error && <p className="text-sm font-semibold">{error}</p>}
        <button
          type="submit"
          disabled={saving || uploading > 0}
          className="min-h-12 bg-black px-6 font-bold text-white disabled:opacity-60"
        >
          {saving ? x.saving : uploading > 0 ? t.images.uploading : x.save}
        </button>
      </div>
    </form>
  );
}
