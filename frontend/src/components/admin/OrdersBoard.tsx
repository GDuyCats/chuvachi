"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatLongDate, formatSlot } from "@/lib/delivery-time";
import { formatPrice } from "@/lib/format";
import {
  adminApi,
  AdminApiError,
  type AdminDay,
  type AdminOrder,
  type AdminOrderList,
  type AdminStatus,
  STAFF_CANCEL_REASONS,
  type StaffCancelReason,
} from "@/lib/admin-api";
import { useAdminI18n } from "./AdminI18n";
import { useAdminMe } from "./AdminShell";
import { AdminRowsSkeleton } from "./AdminSkeletons";
import { BulkCancelPanel } from "./BulkCancelPanel";
import { useToast } from "./Toast";

const REFRESH_MS = 30_000;
const STATUS_ORDER: AdminStatus[] = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"];

// Monochrome status chips: the first step stands out, finished/cancelled ones fade.
const chipClass: Record<AdminStatus, string> = {
  PENDING: "bg-black text-white border-black",
  CONFIRMED: "bg-white text-black border-black",
  PREPARING: "bg-white text-black border-black",
  READY: "bg-white text-black border-black",
  COMPLETED: "bg-[#ededed] text-[#333333] border-[#ededed]",
  CANCELLED: "bg-white text-[#595959] border-[#a8a8a8] line-through",
};

function formatTime(iso: string, lang: "vi" | "en"): string {
  return new Intl.DateTimeFormat(lang === "vi" ? "vi-VN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));
}

export function OrdersBoard() {
  const router = useRouter();
  const { t, lang } = useAdminI18n();
  const [day, setDay] = useState<AdminDay>("today");
  const [showBulk, setShowBulk] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AdminStatus | "ALL">("ALL");
  const [data, setData] = useState<AdminOrderList | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const result = await adminApi.listOrders(day, statusFilter === "ALL" ? undefined : statusFilter);
      setData(result);
      setLoadFailed(false);
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) {
        router.replace("/admin/login");
        return;
      }
      setLoadFailed(true);
    }
  }, [day, statusFilter, router]);

  // Load now, then refresh every 30 seconds so new orders appear on their own.
  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const orders = data?.orders ?? [];
  const selected = orders.find((o) => o.code === selectedCode) ?? null;
  const summary = data?.summary;
  const counts = summary?.counts ?? {};
  const totalCount = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);

  function replaceOrder(updated: AdminOrder) {
    setData((current) =>
      current ? { ...current, orders: current.orders.map((o) => (o.code === updated.code ? updated : o)) } : current,
    );
  }

  async function runAction(action: () => Promise<AdminOrder>) {
    try {
      replaceOrder(await action());
      toast.success(t.orders.updated);
      await load();
    } catch (error) {
      const code = error instanceof AdminApiError ? error.code : "UNKNOWN";
      if (error instanceof AdminApiError && error.status === 401) {
        router.replace("/admin/login");
        return;
      }
      toast.error(t.orders.errors[code as keyof typeof t.orders.errors] ?? t.orders.errors.UNKNOWN);
      await load();
    }
  }

  const stats = summary
    ? [
        { label: t.orders.stats.active, value: String(summary.activeOrders), note: t.orders.stats.activeNote },
        ...(day !== "upcoming"
          ? [
              {
                label: t.orders.stats.portions,
                value: `${summary.bookedPortions} / ${summary.maxPortions}`,
                note: t.orders.stats.portionsNote,
              },
            ]
          : []),
        {
          label: t.orders.stats.waiting,
          value: String(summary.waitingForPayment),
          note: t.orders.stats.waitingNote.replace("{minutes}", String(summary.unpaidCancelMinutes)),
        },
        {
          label: t.orders.stats.toDo,
          value: String((counts.CONFIRMED ?? 0) + (counts.PREPARING ?? 0)),
          note: t.orders.stats.toDoNote,
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl uppercase md:text-[40px]">
            {t.orders.title}
            {data?.date ? ` · ${formatLongDate(data.date, lang)}` : ""}
          </h1>
          <span className="text-[13px] text-muted">{t.orders.autoRefresh}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowBulk((open) => !open)}
            aria-expanded={showBulk}
            className="min-h-11 border-[1.5px] border-black px-4 text-sm font-bold"
          >
            {t.orders.bulk.open}
          </button>
          <div role="group" className="flex border-[1.5px] border-black text-sm font-bold">
            {(["today", "tomorrow", "upcoming"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={option === day}
                onClick={() => {
                  setDay(option);
                  setSelectedCode(null);
                }}
                className={`min-h-10 px-3.5 ${option === day ? "bg-black text-white" : "bg-white"}`}
              >
                {t.orders.days[option]}
              </button>
            ))}
          </div>
          <button type="button" onClick={load} className="min-h-10 border-[1.5px] border-black bg-white px-3.5 text-sm font-bold">
            {t.orders.refresh}
          </button>
        </div>
      </div>

      {showBulk && (
        <BulkCancelPanel
          onClose={() => setShowBulk(false)}
          onDone={() => {
            void load();
          }}
        />
      )}
      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1 border border-[#e0e0e0] bg-white p-4">
              <span className="text-[13px] font-semibold text-muted">{stat.label}</span>
              <span className="font-display text-3xl">{stat.value}</span>
              <span className="text-xs text-muted">{stat.note}</span>
            </div>
          ))}
        </div>
      )}

      <div role="group" aria-label={t.orders.filterLabel} className="no-scrollbar flex gap-2 overflow-x-auto">
        {(["ALL", ...STATUS_ORDER] as const).map((option) => {
          const active = option === statusFilter;
          const count = option === "ALL" ? totalCount : (counts[option] ?? 0);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => setStatusFilter(option)}
              className={`min-h-10 shrink-0 border-[1.5px] border-black px-3.5 text-sm font-bold ${
                active ? "bg-black text-white" : "bg-white"
              }`}
            >
              {option === "ALL" ? t.orders.all : t.orders.status[option]} ({count})
            </button>
          );
        })}
      </div>

      {loadFailed && (
        <p role="alert" className="border-[1.5px] border-black bg-white p-3.5 text-sm font-semibold">
          {t.orders.loadError}
        </p>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-col gap-2.5 lg:flex-[2]">
          {!data && !loadFailed && <AdminRowsSkeleton label={t.orders.loading} />}
          {data && orders.length === 0 && (
            <p className="border border-dashed border-[#a8a8a8] bg-white p-7 text-center text-muted">{t.orders.empty}</p>
          )}
          {orders.map((order) => (
            <OrderRow
              key={order.code}
              order={order}
              selected={order.code === selectedCode}
              onSelect={() => {
                const next = order.code === selectedCode ? null : order.code;
                setSelectedCode(next);
                // On phones the details sit below the list, so scroll down to them.
                if (next && window.innerWidth < 1024) {
                  window.setTimeout(
                    () => document.getElementById("order-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                    50,
                  );
                }
              }}
            />
          ))}
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
            orders.length > 0 && (
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

function OrderRow({ order, selected, onSelect }: { order: AdminOrder; selected: boolean; onSelect: () => void }) {
  const { t, lang } = useAdminI18n();
  const when =
    order.deliveryType === "ASAP"
      ? t.orders.asap
      : `${formatLongDate(order.deliveryDate, lang)} · ${order.deliverySlot ? formatSlot(order.deliverySlot) : ""}`;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex w-full flex-wrap items-center gap-x-4 gap-y-2.5 bg-white p-4 text-left ${
        selected ? "border-2 border-black" : "border border-[#e0e0e0] hover:border-black"
      }`}
    >
      <span className={`min-w-28 border-[1.5px] px-2 py-1 text-center text-[11px] font-bold uppercase tracking-wider ${chipClass[order.status]}`}>
        {t.orders.status[order.status]}
      </span>
      <span className="flex min-w-32 flex-col">
        <span className="font-bold tracking-wider">{order.code}</span>
        <span className="text-[13px] text-muted">{when}</span>
      </span>
      <span className="flex min-w-0 flex-1 basis-40 flex-col">
        <span className="font-semibold">{order.customerName}</span>
        <span className="text-[13px] text-muted">
          {order.deliveryZone[lang]} · {t.orders.portionsShort.replace("{count}", String(order.totalPortions))}
        </span>
      </span>
      <span className="ml-auto flex flex-col items-end">
        <span className="font-bold">{formatPrice(order.total, lang)}</span>
        <span className="text-xs font-semibold text-muted">{t.orders.payment[order.paymentStatus]}</span>
      </span>
    </button>
  );
}

type DetailProps = {
  order: AdminOrder;
  onClose: () => void;
  onAction: (action: () => Promise<AdminOrder>) => Promise<void>;
  formatTime: (iso: string) => string;
};

function OrderDetail({ order, onClose, onAction, formatTime }: DetailProps) {
  const isAdmin = useAdminMe()?.role === "ADMIN"; // erasing customer data is for admins only
  const { t, lang } = useAdminI18n();
  const [busy, setBusy] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [confirmingErase, setConfirmingErase] = useState(false);
  const [cancelReason, setCancelReason] = useState<StaffCancelReason | "">("");
  const [cancelNote, setCancelNote] = useState("");
  const [copied, setCopied] = useState(false);

  const canAdvance = ["PENDING", "CONFIRMED", "PREPARING", "READY"].includes(order.status);
  const canCancel = order.status !== "COMPLETED" && order.status !== "CANCELLED";
  const canRefund = order.status === "CANCELLED" && order.paymentStatus === "PAID";
  const advanceLabel = canAdvance ? t.orders.actions[order.status as "PENDING" | "CONFIRMED" | "PREPARING" | "READY"] : "";

  async function run(action: () => Promise<AdminOrder>) {
    setBusy(true);
    await onAction(action);
    setBusy(false);
    setConfirmingCancel(false);
    setConfirmingErase(false);
  }

  async function copyAddress() {
    const text = `${order.customerName} - ${order.customerPhone}\n${order.address}, ${order.deliveryZone[lang]}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; staff can still select the text by hand.
    }
  }

  const when =
    order.deliveryType === "ASAP"
      ? `${t.orders.asap} · ${formatLongDate(order.deliveryDate, lang)}`
      : `${formatLongDate(order.deliveryDate, lang)} · ${order.deliverySlot ? formatSlot(order.deliverySlot) : ""}`;

  const section = "flex flex-col gap-2 border-t border-[#e0e0e0] pt-4 text-[15px]";
  const sectionTitle = "text-xs font-bold uppercase tracking-widest text-muted";

  return (
    <aside id="order-detail" className="flex scroll-mt-4 flex-col gap-4 border-[1.5px] border-black bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-display text-[28px] tracking-wider">{order.code}</span>
          <span className="text-[13px] text-muted">
            {t.orders.detail.placed} {formatTime(order.createdAt)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`border-[1.5px] px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${chipClass[order.status]}`}>
            {t.orders.status[order.status]}
          </span>
          <button type="button" onClick={onClose} aria-label={t.orders.detail.close} className="h-10 w-10 text-xl">
            ×
          </button>
        </div>
      </div>

      <div className={section}>
        <span className={sectionTitle}>{t.orders.detail.customer}</span>
        <span className="font-semibold">{order.customerName}</span>
        <span>{order.customerPhone}</span>
        <span>
          {order.address}, {order.deliveryZone[lang]}
        </span>
        <div className="mt-1 flex flex-wrap gap-2">
          <a
            href={`tel:${order.customerPhone}`}
            className="flex min-h-10 items-center border-[1.5px] border-black px-3.5 text-sm font-bold"
          >
            {t.orders.detail.call}
          </a>
          <button
            type="button"
            onClick={copyAddress}
            className="min-h-10 border-[1.5px] border-black px-3.5 text-sm font-bold"
          >
            {copied ? t.orders.detail.copied : t.orders.detail.copyAddress}
          </button>
        </div>
      </div>

      <div className={section}>
        <span className={sectionTitle}>{t.orders.detail.delivery}</span>
        <span className="font-semibold">{when}</span>
      </div>

      <div className={section}>
        <span className={sectionTitle}>{t.orders.detail.items}</span>
        {order.items.map((item, index) => (
          <div key={index} className="flex justify-between gap-3">
            <span>
              {item.name[lang]} × {item.quantity}
            </span>
            <span className="whitespace-nowrap">{formatPrice(item.unitPrice * item.quantity, lang)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t-[1.5px] border-black pt-2 font-bold">
          <span>{t.orders.detail.total}</span>
          <span>{formatPrice(order.total, lang)}</span>
        </div>
        <span className="text-xs text-muted">{t.orders.detail.shippingNote}</span>
        {order.note && (
          <div className="bg-surface px-3 py-2.5 text-sm">
            <span className="font-semibold">{t.orders.detail.note}:</span> {order.note}
          </div>
        )}
      </div>

      <div className={section}>
        <span className={sectionTitle}>{t.orders.detail.payment}</span>
        <span className="font-semibold">{t.orders.payment[order.paymentStatus]}</span>
      </div>

      <div className="flex flex-col gap-2 pt-1">
        {canAdvance && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => adminApi.advance(order.code, order.status))}
            className="min-h-12 bg-black px-4 font-bold text-white hover:bg-[#333333] disabled:opacity-60"
          >
            {busy ? t.orders.actions.working : advanceLabel}
          </button>
        )}
        {canRefund && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => adminApi.refund(order.code))}
            className="min-h-12 border-[1.5px] border-black px-4 font-bold disabled:opacity-60"
          >
            {t.orders.actions.refund}
          </button>
        )}
        {isAdmin && !canCancel && !order.erased && !confirmingErase && (
          <button
            type="button"
            onClick={() => setConfirmingErase(true)}
            className="min-h-11 text-sm font-semibold text-[#333333] underline"
          >
            {t.orders.privacy.erase}
          </button>
        )}
        {confirmingErase && (
          <div className="flex flex-col gap-2.5 border-[1.5px] border-black p-3.5">
            <p className="text-sm">{t.orders.privacy.eraseExplain}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => adminApi.eraseCustomer(order.code))}
                className="min-h-11 flex-1 bg-black px-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {t.orders.privacy.eraseConfirm}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingErase(false)}
                className="min-h-11 flex-1 border-[1.5px] border-black px-3 text-sm font-bold"
              >
                {t.orders.actions.cancelKeep}
              </button>
            </div>
          </div>
        )}
        {order.erased && <p className="text-sm text-muted">{t.orders.privacy.erased}</p>}
        {order.status === "CANCELLED" && order.cancelReason && (
          <p className="bg-surface p-3 text-sm">
            <span className="font-bold">{t.orders.detail.cancelledBecause}</span> {t.orders.cancelReasons[order.cancelReason]}
            {order.cancelNote ? ` — ${order.cancelNote}` : ""}
          </p>
        )}
        {canCancel && !confirmingCancel && (
          <button
            type="button"
            onClick={() => setConfirmingCancel(true)}
            className="min-h-11 text-sm font-semibold text-[#333333] underline"
          >
            {t.orders.actions.cancel}
          </button>
        )}
        {canCancel && confirmingCancel && (
          <div className="flex flex-col gap-2.5 border-[1.5px] border-black p-3.5">
            {order.paymentStatus === "PAID" && <p className="text-sm font-semibold">{t.orders.actions.paidWarning}</p>}
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              {t.orders.actions.cancelReason}
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value as StaffCancelReason)}
                className="h-11 border-[1.5px] border-black bg-white px-3 font-normal"
              >
                <option value="" disabled>
                  {t.orders.actions.chooseReason}
                </option>
                {STAFF_CANCEL_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {t.orders.cancelReasons[reason]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              {t.orders.actions.cancelNote}
              <input
                value={cancelNote}
                maxLength={300}
                onChange={(e) => setCancelNote(e.target.value)}
                className="h-11 border-[1.5px] border-black px-3 font-normal"
              />
            </label>
            <p className="text-xs text-muted">{t.orders.actions.customerSees}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !cancelReason}
                onClick={() =>
                  cancelReason && run(() => adminApi.cancel(order.code, order.status, cancelReason, cancelNote.trim()))
                }
                className="min-h-11 flex-1 bg-black px-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {t.orders.actions.cancelConfirm}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingCancel(false)}
                className="min-h-11 flex-1 border-[1.5px] border-black px-3 text-sm font-bold"
              >
                {t.orders.actions.cancelKeep}
              </button>
            </div>
          </div>
        )}
      </div>

      {order.events.length > 0 && (
        <div className={section}>
          <span className={sectionTitle}>{t.orders.detail.history}</span>
          <ul className="flex flex-col gap-1.5 text-[13px]">
            {order.events.map((event, index) => (
              <li key={index} className="flex flex-wrap justify-between gap-x-3">
                <span>
                  {t.orders.events[event.action as keyof typeof t.orders.events] ?? event.action}
                  {event.toStatus && event.action === "ADVANCE" ? ` → ${t.orders.status[event.toStatus]}` : ""}
                  {event.note ? ` (${event.note})` : ""}
                </span>
                <span className="text-muted">
                  {event.by ?? t.orders.detail.system} · {formatTime(event.at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
