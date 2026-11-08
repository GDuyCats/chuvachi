"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { BANKS, vietQrImageUrl } from "@/lib/banks";
import { formatDay } from "@/lib/delivery-time";
import {
  adminApi,
  AdminApiError,
  AdminValidationError,
  type CapacityDay,
  type DeliveryZoneRow,
  type SettingsBundle,
  type ShopSettings,
} from "@/lib/admin-api";
import { useAdminI18n } from "./AdminI18n";
import { useToast } from "./Toast";
import { AdminFormSkeleton } from "./AdminSkeletons";

type Draft = Omit<ShopSettings, "deliverySlots"> & { slotsText: string };

function toDraft(settings: ShopSettings): Draft {
  const { deliverySlots, ...rest } = settings;
  return { ...rest, slotsText: deliverySlots.join("\n") };
}

function fromDraft(draft: Draft): ShopSettings {
  const { slotsText, ...rest } = draft;
  const deliverySlots = slotsText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ""))
    .filter(Boolean);
  return { ...rest, deliverySlots };
}

const inputBase = "h-11 border-[1.5px] px-3 text-[15px] font-normal bg-white";

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

export function SettingsPage() {
  const router = useRouter();
  const { t, lang } = useAdminI18n();
  const s = t.settings;
  const [bundle, setBundle] = useState<SettingsBundle | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const [badFields, setBadFields] = useState<string[]>([]);

  function applyBundle(next: SettingsBundle) {
    setBundle(next);
    setDraft(toDraft(next.settings));
  }

  function applySavedSection(next: SettingsBundle) {
    applyBundle(next);
    toast.success(s.saved);
  }

  function handleError(error: unknown) {
    if (error instanceof AdminApiError && error.status === 401) {
      router.replace("/admin/login");
      return;
    }
    if (error instanceof AdminValidationError) {
      setBadFields(error.fields);
      toast.error(s.invalid);
      return;
    }
    toast.error(s.unknownError);
  }

  useEffect(() => {
    adminApi
      .getSettings()
      .then(applyBundle)
      .catch((error: unknown) => {
        if (error instanceof AdminApiError && error.status === 401) {
          router.replace("/admin/login");
          return;
        }
        setLoadFailed(true);
      });
  }, [router]);

  if (loadFailed) {
    return <p className="border-[1.5px] border-black bg-white p-4 font-semibold">{s.loadError}</p>;
  }
  if (!bundle || !draft) {
    return <AdminFormSkeleton label={s.loading} />;
  }

  const fieldClass = (field: string) =>
    `${inputBase} ${badFields.some((f) => f === field || f.startsWith(`${field}.`)) ? "border-black outline outline-2 outline-offset-1 outline-black bg-[#fff6f6]" : "border-black"}`;

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setBadFields([]);
    try {
      applyBundle(await adminApi.saveSettings(fromDraft(draft)));
      toast.success(s.saved);
    } catch (error) {
      handleError(error);
    } finally {
      setSaving(false);
    }
  }

  const numberField = (key: keyof Draft, label: string) => (
    <label className="flex flex-col gap-1.5 text-sm font-semibold">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={String(draft[key] ?? "")}
        onChange={(e) => update(key, Number(e.target.value) as Draft[typeof key])}
        className={fieldClass(key)}
      />
    </label>
  );

  const textField = (key: keyof Draft, label: string, type = "text", placeholder = "") => (
    <label className="flex flex-col gap-1.5 text-sm font-semibold">
      {label}
      <input
        type={type}
        value={(draft[key] as string | null) ?? ""}
        placeholder={placeholder}
        onChange={(e) => update(key, e.target.value as Draft[typeof key])}
        className={fieldClass(key)}
      />
    </label>
  );

  const previewQr =
    draft.bankBin && draft.bankAccountNumber
      ? vietQrImageUrl({
          bin: draft.bankBin,
          accountNumber: draft.bankAccountNumber,
          accountName: draft.bankAccountName,
          amount: 100000,
          message: "TEST",
        })
      : null;

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={save} className="flex flex-col gap-6">
        <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#e0e0e0] bg-[#fafafa]/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
          <h1 className="font-display text-3xl uppercase md:text-[40px]">{s.title}</h1>
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 bg-black px-6 font-bold text-white hover:bg-[#333333] disabled:opacity-60"
          >
            {saving ? s.saving : s.save}
          </button>
        </div>

        <Section title={s.bank.title} hint={s.bank.hint}>
          <div className="flex flex-col gap-5 md:flex-row">
            <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                {s.bank.bank}
                <select
                  value={draft.bankBin ?? ""}
                  onChange={(e) => {
                    const bank = BANKS.find((b) => b.bin === e.target.value);
                    setDraft((current) =>
                      current ? { ...current, bankBin: bank?.bin ?? null, bankName: bank?.name ?? null } : current,
                    );
                  }}
                  className={fieldClass("bankBin")}
                >
                  <option value="">{s.bank.chooseBank}</option>
                  {BANKS.map((bank) => (
                    <option key={bank.bin} value={bank.bin}>
                      {bank.name}
                    </option>
                  ))}
                </select>
              </label>
              {textField("bankAccountNumber", s.bank.accountNumber)}
              <div className="flex flex-col gap-1 sm:col-span-2">
                {textField("bankAccountName", s.bank.accountName, "text", "NGUYEN VAN A")}
                <span className="text-xs text-muted">{s.bank.accountNameHint}</span>
              </div>
            </div>
            {previewQr && (
              <div className="flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- generated by VietQR */}
                <img src={previewQr} alt={s.bank.preview} width={180} height={180} className="h-auto w-[180px] border border-[#e0e0e0]" />
                <span className="max-w-[180px] text-center text-xs text-muted">{s.bank.preview}</span>
              </div>
            )}
          </div>
        </Section>

        <Section title={s.contact.title} hint={s.contact.hint}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {textField("phone", s.contact.phone, "tel", "0912 345 678")}
            {textField("messengerUrl", s.contact.messenger, "url", "https://m.me/...")}
            {textField("facebookUrl", s.contact.facebook, "url", "https://facebook.com/...")}
            {textField("instagramUrl", s.contact.instagram, "url", "https://instagram.com/...")}
            {textField("tiktokUrl", s.contact.tiktok, "url", "https://tiktok.com/@...")}
          </div>
        </Section>

        <Section title={s.pause.title} hint={s.pause.hint}>
          <label
            className={`flex min-h-12 items-center gap-3 border-[1.5px] px-4 font-bold ${
              draft.orderingPaused ? "border-black bg-black text-white" : "border-black"
            }`}
          >
            <input
              type="checkbox"
              checked={draft.orderingPaused}
              onChange={(e) => update("orderingPaused", e.target.checked)}
              className="h-5 w-5 accent-white"
            />
            {draft.orderingPaused ? s.pause.on : s.pause.off}
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {textField("pauseMessageVi", s.pause.messageVi)}
            {textField("pauseMessageEn", s.pause.messageEn)}
          </div>
          <p className="text-xs text-muted">{s.pause.saveHint}</p>
        </Section>

        <Section title={s.business.title} hint={s.business.hint}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {textField("legalName", s.business.legalName)}
            {textField("registrationNumber", s.business.registrationNumber)}
            {textField("legalAddress", s.business.legalAddress)}
            {textField("contactEmail", s.business.email, "email", "hello@...")}
            {numberField("dataRetentionMonths", s.business.retention)}
          </div>
          <p className="text-xs text-muted">{s.business.retentionHint}</p>
        </Section>

        <Section title={s.rules.title}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {textField("openTime", s.rules.openTime, "time")}
            {textField("closeTime", s.rules.closeTime, "time")}
            {numberField("defaultDailyCapacity", s.rules.capacity)}
            {numberField("smallOrderLeadHours", s.rules.smallLead)}
            {numberField("largeOrderLeadHours", s.rules.largeLead)}
            {numberField("largeOrderThreshold", s.rules.threshold)}
            {numberField("maxDaysAhead", s.rules.maxDays)}
            {numberField("unpaidCancelMinutes", s.rules.unpaid)}
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">{s.rules.closedDays}</legend>
            <div className="flex flex-wrap gap-2">
              {s.rules.weekdays.map((name, index) => {
                const closed = draft.closedWeekdays.includes(index);
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={closed}
                    onClick={() =>
                      update(
                        "closedWeekdays",
                        closed ? draft.closedWeekdays.filter((d) => d !== index) : [...draft.closedWeekdays, index].sort(),
                      )
                    }
                    className={`min-h-10 min-w-12 border-[1.5px] border-black px-3 text-sm font-bold ${
                      closed ? "bg-black text-white" : "bg-white"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {s.rules.slots}
            <textarea
              rows={5}
              value={draft.slotsText}
              onChange={(e) => update("slotsText", e.target.value)}
              className={`${fieldClass("deliverySlots")} h-auto py-2.5 font-mono`}
            />
            <span className="text-xs font-normal text-muted">{s.rules.slotsHint}</span>
          </label>
        </Section>
      </form>

      <TelegramSection />
      <ZonesSection zones={bundle.zones} onSaved={applySavedSection} onError={handleError} />
      <CapacitySection days={bundle.capacity} lang={lang} onSaved={applySavedSection} onError={handleError} />
    </div>
  );
}

type SectionProps = { onSaved: (bundle: SettingsBundle) => void; onError: (error: unknown) => void };

function ZonesSection({ zones, onSaved, onError }: SectionProps & { zones: DeliveryZoneRow[] }) {
  const { t } = useAdminI18n();
  const z = t.settings.zones;
  const [rows, setRows] = useState(zones);
  const [newZone, setNewZone] = useState({ nameVi: "", nameEn: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => setRows(zones), [zones]);

  async function run(action: () => Promise<SettingsBundle>) {
    setBusy(true);
    try {
      onSaved(await action());
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  function edit(id: number, change: Partial<DeliveryZoneRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)));
  }

  const cell = `${inputBase} w-full border-black`;

  return (
    <Section title={z.title} hint={z.hint}>
      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-2 items-end gap-2 border-b border-[#eeeeee] pb-3 sm:grid-cols-[1fr_1fr_80px_auto_auto]">
            <label className="flex flex-col gap-1 text-xs font-semibold">
              {z.nameVi}
              <input value={row.nameVi} onChange={(e) => edit(row.id, { nameVi: e.target.value })} className={cell} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              {z.nameEn}
              <input value={row.nameEn} onChange={(e) => edit(row.id, { nameEn: e.target.value })} className={cell} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              {z.order}
              <input
                type="number"
                min={0}
                value={row.sortOrder}
                onChange={(e) => edit(row.id, { sortOrder: Number(e.target.value) })}
                className={cell}
              />
            </label>
            <label className="flex h-11 items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={row.isActive}
                onChange={(e) => edit(row.id, { isActive: e.target.checked })}
                className="h-5 w-5 accent-black"
              />
              {z.active}
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => adminApi.updateZone(row))}
              className="h-11 border-[1.5px] border-black px-4 text-sm font-bold disabled:opacity-60"
            >
              {z.saveRow}
            </button>
          </div>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() =>
              adminApi.addZone({ ...newZone, isActive: true, sortOrder: rows.length + 1 }).then((bundle) => {
                setNewZone({ nameVi: "", nameEn: "" });
                return bundle;
              }),
            );
          }}
          className="grid grid-cols-2 items-end gap-2 pt-1 sm:grid-cols-[1fr_1fr_auto]"
        >
          <label className="flex flex-col gap-1 text-xs font-semibold">
            {z.nameVi}
            <input required value={newZone.nameVi} onChange={(e) => setNewZone({ ...newZone, nameVi: e.target.value })} className={cell} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            {z.nameEn}
            <input required value={newZone.nameEn} onChange={(e) => setNewZone({ ...newZone, nameEn: e.target.value })} className={cell} />
          </label>
          <button type="submit" disabled={busy} className="col-span-2 h-11 bg-black px-4 text-sm font-bold text-white disabled:opacity-60 sm:col-span-1">
            {z.add}
          </button>
        </form>
      </div>
    </Section>
  );
}

function CapacitySection({ days, lang, onSaved, onError }: SectionProps & { days: CapacityDay[]; lang: "vi" | "en" }) {
  const { t } = useAdminI18n();
  const c = t.settings.capacity;
  const [values, setValues] = useState<Record<string, number>>({});
  const [busyDate, setBusyDate] = useState<string | null>(null);

  useEffect(() => setValues(Object.fromEntries(days.map((d) => [d.date, d.maxPortions]))), [days]);

  async function save(date: string) {
    setBusyDate(date);
    try {
      onSaved(await adminApi.setCapacity(date, values[date] ?? 0));
    } catch (error) {
      onError(error);
    } finally {
      setBusyDate(null);
    }
  }

  return (
    <Section title={c.title} hint={c.hint}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-[15px]">
          <thead>
            <tr className="border-b-[1.5px] border-black text-left text-xs uppercase tracking-wider text-muted">
              <th className="py-2 font-bold">{c.date}</th>
              <th className="py-2 font-bold">{c.booked}</th>
              <th className="py-2 font-bold">{c.max}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const { weekday, day: dayText } = formatDay(day.date, lang);
              return (
                <tr key={day.date} className="border-b border-[#eeeeee]">
                  <td className="py-2 font-semibold">
                    {weekday} {dayText}
                    {day.isCustom && <span className="ml-2 text-xs font-normal text-muted">({c.custom})</span>}
                  </td>
                  <td className="py-2">{day.bookedPortions}</td>
                  <td className="py-2">
                    <input
                      type="number"
                      min={0}
                      aria-label={`${c.max} ${weekday} ${dayText}`}
                      value={values[day.date] ?? day.maxPortions}
                      onChange={(e) => setValues({ ...values, [day.date]: Number(e.target.value) })}
                      className={`${inputBase} w-24 border-black`}
                    />
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      disabled={busyDate === day.date}
                      onClick={() => save(day.date)}
                      className="h-10 border-[1.5px] border-black px-3.5 text-sm font-bold disabled:opacity-60"
                    >
                      {c.saveRow}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}


// Sends a test Telegram message so staff can check the setup.
function TelegramSection() {
  const router = useRouter();
  const toast = useToast();
  const { t } = useAdminI18n();
  const m = t.settings.telegram;
  const [busy, setBusy] = useState(false);

  async function test() {
    setBusy(true);
    try {
      await adminApi.testTelegram();
      toast.success(m.sent);
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const code = error instanceof AdminApiError ? error.code : "UNKNOWN";
      toast.error(code === "TELEGRAM_NOT_CONFIGURED" ? m.notConfigured : code === "TELEGRAM_FAILED" ? m.failed : t.settings.unknownError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title={m.title} hint={m.hint}>
      <button
        type="button"
        disabled={busy}
        onClick={test}
        className="min-h-11 self-start border-[1.5px] border-black px-5 text-sm font-bold disabled:opacity-60"
      >
        {busy ? m.sending : m.test}
      </button>
    </Section>
  );
}
