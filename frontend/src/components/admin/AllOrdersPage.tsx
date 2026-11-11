"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";
import {
  adminApi,
  AdminApiError,
  type AdminOrder,
  type AdminPaymentStatus,
  type AdminStatus,
  type CancelReason,
  type OrderHistory,
  type OrderHistoryFilters,
} from "@/lib/admin-api";
import { useAdminI18n } from "./AdminI18n";
import { AdminRowsSkeleton } from "./AdminSkeletons";
import { formatTime, OrderDetail, OrderRow } from "./OrdersBoard";
import { useToast } from "./Toast";

const STATUSES: AdminStatus[] = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"];
const PAYMENTS: AdminPaymentStatus[] = ["UNPAID", "PAID", "REFUNDED"];
const REASONS: CancelReason[] = ["OUT_OF_INGREDIENTS", "CANNOT_DELIVER", "CUSTOMER_REQUEST", "SHOP_CLOSED", "UNPAID_TIMEOUT", "OTHER"];
const SORTS = ["new", "old", "totalDesc", "totalAsc"] as const;
const EMPTY: OrderHistoryFilters = { dateBy: "created", sort: "new", page: 1 };

// Every order ever placed: search, filter, page through and export to Excel.
export function AllOrdersPage() {
  const router = useRouter();
  const toast = useToast();
  const { t, lang } = useAdminI18n();
  const h = t.orders.history;
  const [filters, setFilters] = useState<OrderHistoryFilters>(EMPTY);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<OrderHistory | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adminApi.orderHistory(filters));
      setFailed(false);
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) {
        router.replace("/admin/login");
        return;
      }
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [filters, router]);

  useEffect(() => {
    void load();
  }, [load]);

  // Search runs a moment after typing stops.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => (current.q === (search.trim() || undefined) ? current : { ...current, q: search.trim() || undefined, page: 1 }));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [search]);

  function set<K extends keyof OrderHistoryFilters>(key: K, value: OrderHistoryFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value, page: key === "page" ? (value as number) : 1 }));
    if (key !== "page") setSelectedCode(null);
  }

  function reset() {
    setSearch("");
    setFilters(EMPTY);
    setSelectedCode(null);
  }

  async function exportCsv() {
    setExporting(true);
    try {
      await adminApi.exportOrders(filters);
    } catch {
      toast.error(h.exportError);
    } finally {
      setExporting(false);
    }
  }

  async function runAction(action: () => Promise<AdminOrder>) {
    try {
      const updated = await action();
      setData((current) =>
        current ? { ...current, orders: current.orders.map((o) => (o.code === updated.code ? updated : o)) } : current,
      );
      toast.success(t.orders.updated);
    } catch (error) {
      const code = error instanceof AdminApiError ? error.code : "UNKNOWN";
      toast.error(t.orders.errors[code as keyof typeof t.orders.errors] ?? t.orders.errors.UNKNOWN);
      await load();
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.count / data.pageSize)) : 1;
  const page = filters.page ?? 1;
  const selected = data?.orders.find((o) => o.code === selectedCode) ?? null;
  const filtered = JSON.stringify({ ...filters, page: 1 }) !== JSON.stringify(EMPTY) || search !== "";

  const label = "flex flex-col gap-1 text-[13px] font-semibold";
  const control = "h-10 border-[1.5px] border-black bg-white px-2.5 text-sm font-normal";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/admin/orders" className="text-sm font-semibold underline">
            ← {h.back}
          </Link>
          <h1 className="font-display text-3xl uppercase md:text-[40px]">{h.title}</h1>
          <span className="text-[13px] text-muted">{h.hint}</span>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={exporting || !data || data.count === 0}
          className="min-h-11 border-[1.5px] border-black bg-white px-4 text-sm font-bold disabled:opacity-50"
        >
          {exporting ? h.exporting : h.export}
        </button>
      </div>

      <div className="flex flex-col gap-3 border border-[#e0e0e0] bg-white p-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={h.searchPlaceholder}
          aria-label={h.search}
          className="h-11 w-full border-[1.5px] border-black px-3 text-[15px]"
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
          <label className={label}>
            {h.status}
            <select
              value={filters.status ?? ""}
              onChange={(e) => set("status", (e.target.value || undefined) as AdminStatus | undefined)}
              className={control}
            >
              <option value="">{h.any}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t.orders.status[s]}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            {h.payment}
            <select
              value={filters.payment ?? ""}
              onChange={(e) => set("payment", (e.target.value || undefined) as AdminPaymentStatus | undefined)}
              className={control}
            >
              <option value="">{h.any}</option>
              {PAYMENTS.map((p) => (
                <option key={p} value={p}>
                  {t.orders.payment[p]}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            {h.cancelReason}
            <select
              value={filters.cancelReason ?? ""}
              onChange={(e) => set("cancelReason", (e.target.value || undefined) as CancelReason | undefined)}
              className={control}
            >
              <option value="">{h.any}</option>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {t.orders.cancelReasons[r]}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            {h.product}
            <select
              value={filters.productId ?? ""}
              onChange={(e) => set("productId", e.target.value ? Number(e.target.value) : undefined)}
              className={control}
            >
              <option value="">{h.any}</option>
              {data?.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {lang === "vi" ? p.nameVi : p.nameEn}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            {h.zone}
            <select
              value={filters.zoneId ?? ""}
              onChange={(e) => set("zoneId", e.target.value ? Number(e.target.value) : undefined)}
              className={control}
            >
              <option value="">{h.any}</option>
              {data?.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {lang === "vi" ? z.nameVi : z.nameEn}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            {h.dateBy}
            <select
              value={filters.dateBy ?? "created"}
              onChange={(e) => set("dateBy", e.target.value as "created" | "delivery")}
              className={control}
            >
              <option value="created">{h.dateByCreated}</option>
              <option value="delivery">{h.dateByDelivery}</option>
            </select>
          </label>
          <label className={label}>
            {h.from}
            <input type="date" value={filters.from ?? ""} onChange={(e) => set("from", e.target.value || undefined)} className={control} />
          </label>
          <label className={label}>
            {h.to}
            <input type="date" value={filters.to ?? ""} onChange={(e) => set("to", e.target.value || undefined)} className={control} />
          </label>
          <label className={label}>
            {h.sort}
            <select
              value={filters.sort ?? "new"}
              onChange={(e) => set("sort", e.target.value as (typeof SORTS)[number])}
              className={control}
            >
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {h.sorts[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={filters.edited === "1"}
              onChange={(e) => set("edited", e.target.checked ? "1" : undefined)}
              className="h-5 w-5 accent-black"
            />
            {h.editedOnly}
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e0e0e0] pt-3 text-sm">
          <span className="font-semibold" aria-live="polite">
            {data ? h.summary.replace("{count}", String(data.count)).replace("{revenue}", formatPrice(data.revenue, lang)) : ""}
            {loading && data ? ` · ${t.orders.loading}` : ""}
          </span>
          {filtered && (
            <button type="button" onClick={reset} className="min-h-9 font-semibold underline">
              {h.reset}
            </button>
          )}
        </div>
      </div>

      {failed && (
        <p role="alert" className="border-[1.5px] border-black bg-white p-3.5 text-sm font-semibold">
          {t.orders.loadError}
        </p>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-col gap-2.5 lg:flex-[2]">
          {!data && !failed && <AdminRowsSkeleton label={t.orders.loading} />}
          {data && data.orders.length === 0 && (
            <p className="border border-dashed border-[#a8a8a8] bg-white p-7 text-center text-muted">{h.empty}</p>
          )}
          {data?.orders.map((order) => (
            <OrderRow
              key={order.code}
              order={order}
              selected={order.code === selectedCode}
              onSelect={() => {
                const next = order.code === selectedCode ? null : order.code;
                setSelectedCode(next);
                if (next && window.innerWidth < 1024) {
                  window.setTimeout(
                    () => document.getElementById("order-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                    50,
                  );
                }
              }}
            />
          ))}
          {data && pages > 1 && (
            <nav aria-label={h.pages} className="flex items-center justify-between gap-3 pt-2 text-sm font-bold">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => {
                  set("page", page - 1);
                  window.scrollTo({ top: 0 });
                }}
                className="min-h-10 border-[1.5px] border-black bg-white px-4 disabled:opacity-40"
              >
                ← {h.prev}
              </button>
              <span>{h.pageOf.replace("{page}", String(page)).replace("{pages}", String(pages))}</span>
              <button
                type="button"
                disabled={page >= pages || loading}
                onClick={() => {
                  set("page", page + 1);
                  window.scrollTo({ top: 0 });
                }}
                className="min-h-10 border-[1.5px] border-black bg-white px-4 disabled:opacity-40"
              >
                {h.next} →
              </button>
            </nav>
          )}
        </div>

        <div className="min-w-0 lg:sticky lg:top-4 lg:flex-1">
          {selected ? (
            <OrderDetail
              key={selected.code}
              order={selected}
              onClose={() => setSelectedCode(null)}
              onAction={runAction}
              formatTime={(iso) => formatTime(iso, lang)}
            />
          ) : (
            data &&
            data.orders.length > 0 && (
              <p className="hidden border border-dashed border-[#a8a8a8] bg-white p-7 text-center text-muted lg:block">
                {t.orders.detail.selectHint}
              </p>
            )
          )}
        </div>
      </div>
    </div>
  );
}
