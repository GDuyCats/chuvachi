"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { adminApi, AdminApiError, type SalesReport } from "@/lib/admin-api";
import { formatPrice } from "@/lib/format";
import { addDaysText, vietnamTodayText } from "@/lib/shop-date";
import { useAdminI18n } from "./AdminI18n";
import { AdminRowsSkeleton } from "./AdminSkeletons";
import { ProfitPanel } from "./ProfitPanel";

type Preset = "7" | "30" | "month" | "lastMonth" | "all" | "custom";
type Range = { from: string | null; to: string | null };

function presetRange(preset: Preset, today: string): Range {
  const monthStart = `${today.slice(0, 8)}01`;
  switch (preset) {
    case "7":
      return { from: addDaysText(today, -6), to: today };
    case "30":
      return { from: addDaysText(today, -29), to: today };
    case "month":
      return { from: monthStart, to: today };
    case "lastMonth": {
      const lastDay = addDaysText(monthStart, -1);
      return { from: `${lastDay.slice(0, 8)}01`, to: lastDay };
    }
    default:
      return { from: null, to: null };
  }
}

// "2026-11-08" -> "08/11/2026", or "11/2026" for a month
function showDate(date: string, unit: "day" | "month" = "day"): string {
  const [year, month, day] = date.split("-");
  return unit === "month" ? `${month}/${year}` : `${day}/${month}/${year}`;
}

// Sales by cake and over time, counted from paid orders that were not cancelled.
export function StatsPage() {
  const router = useRouter();
  const { t, lang } = useAdminI18n();
  const st = t.stats;
  const [preset, setPreset] = useState<Preset>("30");
  const [custom, setCustom] = useState<Range>({ from: null, to: null });
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (range: Range) => {
      setLoading(true);
      setFailed(false);
      try {
        setReport(await adminApi.getStats(range.from, range.to));
      } catch (error) {
        if (error instanceof AdminApiError && error.status === 401) {
          router.replace("/admin/login");
          return;
        }
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    if (preset === "custom") return;
    void load(presetRange(preset, vietnamTodayText()));
  }, [preset, load]);

  const presets: { key: Preset; label: string }[] = [
    { key: "7", label: st.presets.last7 },
    { key: "30", label: st.presets.last30 },
    { key: "month", label: st.presets.thisMonth },
    { key: "lastMonth", label: st.presets.lastMonth },
    { key: "all", label: st.presets.all },
    { key: "custom", label: st.presets.custom },
  ];

  const money = (amount: number) => formatPrice(amount, lang);
  const number = (value: number) => value.toLocaleString(lang === "vi" ? "vi-VN" : "en-US");
  const field = "h-11 border-[1.5px] border-black bg-white px-3 text-[15px] font-normal";

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl uppercase md:text-[40px]">{st.title}</h1>
        <p className="text-sm text-muted">{st.hint}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setPreset(item.key)}
            aria-pressed={preset === item.key}
            className={`min-h-10 border-[1.5px] border-black px-3.5 text-sm font-bold ${preset === item.key ? "bg-black text-white" : "bg-white"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {st.from}
            <input type="date" value={custom.from ?? ""} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value || null }))} className={field} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {st.to}
            <input type="date" value={custom.to ?? ""} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value || null }))} className={field} />
          </label>
          <button
            type="button"
            disabled={Boolean(custom.from && custom.to && custom.from > custom.to)}
            onClick={() => void load(custom)}
            className="h-11 bg-black px-5 text-sm font-bold text-white disabled:opacity-50"
          >
            {st.show}
          </button>
        </div>
      )}

      {failed && <p className="border-[1.5px] border-black bg-white p-4 font-semibold">{st.loadError}</p>}
      {loading && !report && <AdminRowsSkeleton label={st.loading} />}

      {report && (
        <div className={`flex flex-col gap-6 transition-opacity ${loading ? "opacity-50" : ""}`}>
          <ProfitPanel from={report.from} to={report.to} />

          <p className="text-sm font-semibold">
            {report.from || report.to
              ? st.rangeLabel.replace("{from}", report.from ? showDate(report.from) : "...").replace("{to}", report.to ? showDate(report.to) : "...")
              : st.presets.all}
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: st.totals.revenue, value: money(report.totals.revenue), note: st.totals.revenueNote },
              { label: st.totals.portions, value: number(report.totals.portions) },
              { label: st.totals.orders, value: number(report.totals.orders) },
            ].map((tile) => (
              <div key={tile.label} className="flex flex-col gap-1 border border-[#e0e0e0] bg-white p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-muted">{tile.label}</span>
                <span className="text-2xl font-bold">{tile.value}</span>
                {tile.note && <span className="text-xs text-muted">{tile.note}</span>}
              </div>
            ))}
          </div>

          {report.totals.orders === 0 ? (
            <p className="border border-dashed border-[#a8a8a8] bg-white p-6 text-center text-muted">{st.empty}</p>
          ) : (
            <>
              <section className="flex flex-col gap-3 border border-[#e0e0e0] bg-white p-5">
                <h2 className="font-display text-2xl uppercase tracking-wide">{st.byProduct}</h2>
                <ol className="flex flex-col">
                  {report.products.map((row, index) => {
                    const share = report.totals.portions > 0 ? row.portions / report.totals.portions : 0;
                    return (
                      <li key={`${row.productId ?? row.nameVi}`} className="flex flex-col gap-1.5 border-b border-[#eeeeee] py-3 last:border-b-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <span className="font-bold">
                            {index + 1}. {lang === "vi" ? row.nameVi : row.nameEn}
                          </span>
                          <span className="text-sm">
                            <strong>{st.portionsCount.replace("{count}", number(row.portions))}</strong>
                            {" · "}
                            {st.ordersCount.replace("{count}", number(row.orders))}
                            {" · "}
                            {money(row.revenue)}
                          </span>
                        </div>
                        <div className="h-2 bg-[#eeeeee]" aria-hidden="true">
                          <div className="h-full bg-black" style={{ width: `${Math.max(share * 100, 1)}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>

              <section className="flex flex-col gap-3 border border-[#e0e0e0] bg-white p-5">
                <h2 className="font-display text-2xl uppercase tracking-wide">
                  {report.unit === "month" ? st.byMonth : st.byDay}
                </h2>
                <ul className="flex flex-col gap-1.5">
                  {(() => {
                    const top = Math.max(...report.periods.map((p) => p.revenue), 1);
                    return report.periods.map((row) => (
                      <li key={row.start} className="grid grid-cols-[88px_1fr] items-center gap-3 text-sm sm:grid-cols-[96px_1fr_auto]">
                        <span className="text-muted">{showDate(row.start, report.unit)}</span>
                        <div className="h-5 bg-[#f2f2f2]" aria-hidden="true">
                          <div className="h-full bg-black" style={{ width: `${Math.max((row.revenue / top) * 100, 1)}%` }} />
                        </div>
                        <span className="col-span-2 text-right sm:col-span-1">
                          {money(row.revenue)} · {st.portionsCount.replace("{count}", number(row.portions))}
                        </span>
                      </li>
                    ));
                  })()}
                </ul>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
