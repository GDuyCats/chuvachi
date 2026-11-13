"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminApi, type ProfitSummary } from "@/lib/admin-api";
import { formatPrice } from "@/lib/format";
import { useAdminI18n } from "./AdminI18n";

// "2026-11-08" -> "08/11", or "11/2026" for a month
function showPeriod(date: string, unit: "day" | "month"): string {
  const [year, month, day] = date.split("-");
  return unit === "month" ? `${month}/${year}` : `${day}/${month}`;
}

// Profit and loss for the range chosen on the sales page: sales minus recorded costs.
export function ProfitPanel({ from, to }: { from: string | null; to: string | null }) {
  const { t, lang } = useAdminI18n();
  const p = t.stats.profit;
  const [summary, setSummary] = useState<ProfitSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    adminApi
      .profitSummary(from, to)
      .then((result) => {
        if (!active) return;
        setSummary(result);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [from, to]);

  const money = (amount: number) => formatPrice(Math.abs(amount), lang);
  const signed = (amount: number) => `${amount < 0 ? "−" : ""}${money(amount)}`;

  if (failed) return <p className="border-[1.5px] border-black bg-white p-4 text-sm font-semibold">{p.loadError}</p>;
  if (!summary) return null;

  const margin = summary.revenue > 0 ? Math.round((summary.profit / summary.revenue) * 100) : null;
  const loss = summary.profit < 0;
  const topCategory = Math.max(...summary.byCategory.map((c) => c.amount), 1);
  const topPeriod = Math.max(...summary.periods.map((row) => Math.max(row.revenue, row.costs)), 1);

  return (
    <section className="flex flex-col gap-4 border-[1.5px] border-black bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl uppercase tracking-wide">{p.title}</h2>
        <Link href="/admin/expenses" className="text-sm font-semibold underline">
          {p.openExpenses} →
        </Link>
      </div>
      <p className="text-xs text-muted">{p.hint}</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1 border border-[#e0e0e0] p-4">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">{p.revenue}</span>
          <span className="text-2xl font-bold">{money(summary.revenue)}</span>
          <span className="text-xs text-muted">{p.ordersCount.replace("{count}", String(summary.orders))}</span>
        </div>
        <div className="flex flex-col gap-1 border border-[#e0e0e0] p-4">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">{p.costs}</span>
          <span className="text-2xl font-bold">{money(summary.costs)}</span>
          <span className="text-xs text-muted">{p.expensesCount.replace("{count}", String(summary.expenses))}</span>
        </div>
        <div className={`flex flex-col gap-1 p-4 ${loss ? "border-[1.5px] border-black" : "bg-black text-white"}`}>
          <span className={`text-xs font-bold uppercase tracking-wider ${loss ? "" : "text-[#c7c7c7]"}`}>{loss ? p.loss : p.profitLabel}</span>
          <span className="text-2xl font-bold">{signed(summary.profit)}</span>
          {margin !== null && <span className={`text-xs ${loss ? "text-muted" : "text-[#c7c7c7]"}`}>{p.margin.replace("{percent}", String(margin))}</span>}
        </div>
      </div>

      {summary.expenses === 0 && <p className="text-sm text-muted">{p.noCosts}</p>}

      {summary.costs > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted">{p.byCategory}</h3>
          <ul className="flex flex-col gap-1.5">
            {summary.byCategory
              .filter((c) => c.amount > 0)
              .map((c) => (
                <li key={c.category} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-sm">
                  <span>{t.expenses.categories[c.category]}</span>
                  <div className="h-3 bg-[#f2f2f2]" aria-hidden="true">
                    <div className="h-full bg-black" style={{ width: `${Math.max((c.amount / topCategory) * 100, 1)}%` }} />
                  </div>
                  <span className="text-right font-semibold">{money(c.amount)}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {summary.periods.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted">{summary.unit === "month" ? p.byMonth : p.byDay}</h3>
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-4 bg-black" aria-hidden="true" />
              {p.revenue}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-4 border border-black bg-[repeating-linear-gradient(45deg,#000_0,#000_1px,#fff_1px,#fff_4px)]" aria-hidden="true" />
              {p.costs}
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {summary.periods.map((row) => (
              <li key={row.start} className="grid grid-cols-[64px_1fr_auto] items-center gap-3 text-sm">
                <span className="text-muted">{showPeriod(row.start, summary.unit)}</span>
                <div className="flex flex-col gap-0.5" aria-hidden="true">
                  <div className="h-2.5 bg-black" style={{ width: `${(row.revenue / topPeriod) * 100}%` }} />
                  <div
                    className="h-2.5 border border-black bg-[repeating-linear-gradient(45deg,#000_0,#000_1px,#fff_1px,#fff_4px)]"
                    style={{ width: `${(row.costs / topPeriod) * 100}%`, display: row.costs > 0 ? undefined : "none" }}
                  />
                </div>
                <span className={`text-right font-semibold ${row.profit < 0 ? "underline decoration-2" : ""}`}>{signed(row.profit)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">{p.periodNote}</p>
        </div>
      )}
    </section>
  );
}
