"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  adminApi,
  AdminApiError,
  STAFF_CANCEL_REASONS,
  type AdminProduct,
  type BulkCancelRow,
  type StaffCancelReason,
} from "@/lib/admin-api";
import { formatPrice } from "@/lib/format";
import { useAdminI18n } from "./AdminI18n";
import { useToast } from "./Toast";

type Props = {
  onClose: () => void;
  onDone: () => void; // reload the order list after cancelling
};

const field = "h-11 w-full border-[1.5px] border-black bg-white px-3 text-[15px] font-normal";

// Cancels every open order of one delivery day (optionally only those with one cake),
// with one reason for all, then lists the paid orders that need a refund.
export function BulkCancelPanel({ onClose, onDone }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { t, lang } = useAdminI18n();
  const b = t.orders.bulk;

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [date, setDate] = useState("");
  const [productId, setProductId] = useState("");
  const [reason, setReason] = useState<StaffCancelReason | "">("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<BulkCancelRow[] | null>(null);
  const [result, setResult] = useState<BulkCancelRow[] | null>(null);
  const [refunded, setRefunded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi
      .listProducts()
      .then(setProducts)
      .catch(() => setProducts([]));
  }, []);

  function handleError(error: unknown) {
    if (error instanceof AdminApiError && error.status === 401) {
      router.replace("/admin/login");
      return;
    }
    toast.error(t.orders.errors.UNKNOWN);
  }

  const selectedProduct = productId ? Number(productId) : null;

  async function loadPreview() {
    if (!date) return;
    setBusy(true);
    setResult(null);
    try {
      setPreview((await adminApi.bulkCancelPreview(date, selectedProduct)).orders);
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!date || !reason || !preview || preview.length === 0) return;
    setBusy(true);
    try {
      const { cancelled } = await adminApi.bulkCancel(date, selectedProduct, reason, note.trim());
      setResult(cancelled);
      setPreview(null);
      toast.success(b.done.replace("{count}", String(cancelled.length)));
      onDone();
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  async function markRefunded(code: string) {
    try {
      await adminApi.refund(code);
      setRefunded((current) => new Set(current).add(code));
      toast.success(t.orders.updated);
    } catch (error) {
      handleError(error);
    }
  }

  const needRefund = result?.filter((row) => row.paid) ?? [];

  return (
    <section className="flex flex-col gap-4 border-[1.5px] border-black bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl uppercase tracking-wide">{b.title}</h2>
          <p className="text-sm text-muted">{b.hint}</p>
        </div>
        <button type="button" onClick={onClose} className="min-h-11 px-2 text-sm font-semibold underline">
          {t.orders.detail.close}
        </button>
      </div>

      {!result && (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              {b.date}
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setPreview(null);
                }}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              {b.product}
              <select
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  setPreview(null);
                }}
                className={field}
              >
                <option value="">{b.allProducts}</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {lang === "vi" ? product.nameVi : product.nameEn}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            disabled={!date || busy}
            onClick={loadPreview}
            className="min-h-11 self-start border-[1.5px] border-black px-5 text-sm font-bold disabled:opacity-50"
          >
            {b.preview}
          </button>
        </>
      )}

      {preview && preview.length === 0 && <p className="text-sm font-semibold">{b.none}</p>}

      {preview && preview.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold">
            {b.willCancel.replace("{count}", String(preview.length))}{" "}
            {b.paidCount.replace("{count}", String(preview.filter((row) => row.paid).length))}
          </p>
          <ul className="flex max-h-60 flex-col overflow-y-auto border border-[#e0e0e0] text-sm">
            {preview.map((row) => (
              <li key={row.code} className="flex justify-between gap-3 border-b border-[#eeeeee] px-3 py-2 last:border-b-0">
                <span className="font-bold tracking-[0.04em]">{row.code}</span>
                <span className="truncate text-muted">{row.customerName}</span>
                <span>
                  {formatPrice(row.total, lang)}
                  {row.paid ? ` · ${b.paid}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              {t.orders.actions.cancelReason}
              <select value={reason} onChange={(e) => setReason(e.target.value as StaffCancelReason)} className={field}>
                <option value="" disabled>
                  {t.orders.actions.chooseReason}
                </option>
                {STAFF_CANCEL_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {t.orders.cancelReasons[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              {t.orders.actions.cancelNote}
              <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className={field} />
            </label>
          </div>
          <p className="text-xs text-muted">{t.orders.actions.customerSees}</p>
          <button
            type="button"
            disabled={!reason || busy}
            onClick={confirm}
            className="min-h-11 self-start bg-black px-5 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? t.orders.actions.working : b.confirm.replace("{count}", String(preview.length))}
          </button>
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold">{b.done.replace("{count}", String(result.length))}</p>
          {needRefund.length > 0 ? (
            <>
              <p className="text-sm">{b.refundHint}</p>
              <ul className="flex flex-col border border-[#e0e0e0] text-sm">
                {needRefund.map((row) => (
                  <li
                    key={row.code}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eeeeee] px-3 py-2 last:border-b-0"
                  >
                    <span className="font-bold tracking-[0.04em]">{row.code}</span>
                    <span>{row.customerName}</span>
                    <a href={`tel:${row.customerPhone}`} className="underline">
                      {row.customerPhone}
                    </a>
                    <span className="font-bold">{formatPrice(row.total, lang)}</span>
                    {refunded.has(row.code) ? (
                      <span className="text-muted">{b.refunded}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => markRefunded(row.code)}
                        className="min-h-9 border-[1.5px] border-black px-3 text-xs font-bold"
                      >
                        {t.orders.actions.refund}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted">{b.noRefund}</p>
          )}
        </div>
      )}
    </section>
  );
}
