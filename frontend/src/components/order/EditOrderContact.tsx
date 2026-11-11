"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { accountApi } from "@/lib/account-api";
import { rememberOrder } from "@/lib/my-orders";
import {
  ApiError,
  editOrderAsGuest,
  fetchOrderSettings,
  type OrderContactChanges,
  type OrderLookup,
} from "@/lib/public-api";
import { TURNSTILE_ENABLED, TurnstileWidget } from "./TurnstileWidget";

type Labels = Dictionary["track"]["edit"];

// Lets the customer fix the name, phone, address, zone or note of their order until the shop starts
// making it. "phone" is the number the order was looked up with; null when opened from the account.
export function EditOrderContact({
  lang,
  order,
  phone,
  labels,
  onUpdated,
}: {
  lang: Locale;
  order: OrderLookup;
  phone: string | null;
  labels: Labels;
  onUpdated: (order: OrderLookup, phone: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (order.status === "CANCELLED" || order.status === "COMPLETED") return null;

  if (order.editsLeft <= 0) {
    const allowedStatus = order.status === "PENDING" || order.status === "CONFIRMED";
    return <p className="border-[1.5px] border-black p-4 text-sm">{allowedStatus ? labels.limit : labels.locked}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {message && (
        <p role="status" className="bg-black px-4 py-3 text-sm font-semibold text-white">
          {message}
        </p>
      )}
      {open ? (
        <EditForm
          lang={lang}
          order={order}
          phone={phone}
          labels={labels}
          onCancel={() => setOpen(false)}
          onDone={(updated, newPhone, phoneChanged) => {
            setOpen(false);
            setMessage(phoneChanged && phone ? labels.savedPhone : labels.saved);
            onUpdated(updated, newPhone);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setOpen(true);
          }}
          className="min-h-12 self-start border-[1.5px] border-black px-5 font-bold"
        >
          {labels.open}
        </button>
      )}
    </div>
  );
}

function EditForm({
  lang,
  order,
  phone,
  labels,
  onCancel,
  onDone,
}: {
  lang: Locale;
  order: OrderLookup;
  phone: string | null;
  labels: Labels;
  onCancel: () => void;
  onDone: (order: OrderLookup, phone: string | null, phoneChanged: boolean) => void;
}) {
  const [name, setName] = useState(order.customerName);
  const [newPhone, setNewPhone] = useState("");
  const [address, setAddress] = useState("");
  const [zoneId, setZoneId] = useState(order.deliveryZoneId);
  const [note, setNote] = useState(order.note ?? "");
  const [zones, setZones] = useState<{ id: number; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [botToken, setBotToken] = useState<string | null>(null);
  const [botReset, setBotReset] = useState(0);
  const isGuest = phone !== null;

  useEffect(() => {
    fetchOrderSettings(lang)
      .then((settings) => setZones(settings.deliveryZones))
      .catch(() => setZones([]));
  }, [lang]);

  const zoneOptions = zones.some((zone) => zone.id === order.deliveryZoneId)
    ? zones
    : [{ id: order.deliveryZoneId, name: order.deliveryZone }, ...zones];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const changes: OrderContactChanges = {};
    if (name.trim() && name.trim() !== order.customerName) changes.customerName = name.trim();
    if (newPhone.trim()) changes.customerPhone = newPhone.trim();
    if (address.trim()) changes.address = address.trim();
    if (zoneId !== order.deliveryZoneId) changes.deliveryZoneId = zoneId;
    if ((note.trim() || null) !== order.note) changes.note = note.trim() || null;
    if (Object.keys(changes).length === 0) {
      setError(labels.errors.NO_CHANGES);
      return;
    }
    if (isGuest && TURNSTILE_ENABLED && !botToken) {
      setError(labels.errors.BOT_CHECK_PENDING);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result =
        phone !== null
          ? await editOrderAsGuest(order.code, phone, lang, changes, botToken)
          : await accountApi.editOrder(order.code, lang, changes);
      if (isGuest) rememberOrder(order.code, result.phone); // the device keeps opening it with the right phone
      onDone(result.order, isGuest ? result.phone : null, changes.customerPhone !== undefined);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "UNKNOWN";
      setError(labels.errors[code as keyof typeof labels.errors] ?? labels.errors.UNKNOWN);
    } finally {
      setBusy(false);
      setBotReset((n) => n + 1); // each check token works once
    }
  }

  const field = "flex flex-col gap-1.5 text-sm font-semibold";
  const input = "h-12 border-[1.5px] border-black bg-white px-3.5 text-[16px] font-normal";
  const hint = "text-xs font-normal text-muted";

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 border-[1.5px] border-black p-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-[13px] font-bold uppercase tracking-widest">{labels.title}</h3>
        <p className="text-sm text-[#333333]">{labels.intro.replace("{count}", String(order.editsLeft))}</p>
      </div>
      <label className={field}>
        {labels.name}
        <input value={name} required maxLength={100} autoComplete="name" onChange={(e) => setName(e.target.value)} className={input} />
      </label>
      <label className={field}>
        {labels.phone}
        <input
          value={newPhone}
          type="tel"
          inputMode="tel"
          maxLength={20}
          autoComplete="tel"
          onChange={(e) => setNewPhone(e.target.value)}
          className={input}
        />
        <span className={hint}>{labels.phoneHint}</span>
      </label>
      <label className={field}>
        {labels.address}
        <textarea
          value={address}
          maxLength={300}
          rows={2}
          autoComplete="street-address"
          onChange={(e) => setAddress(e.target.value)}
          className="border-[1.5px] border-black bg-white px-3.5 py-2.5 text-[16px] font-normal"
        />
        <span className={hint}>{labels.addressHint.replace("{current}", order.address)}</span>
      </label>
      <label className={field}>
        {labels.zone}
        <select value={zoneId} onChange={(e) => setZoneId(Number(e.target.value))} className={input}>
          {zoneOptions.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </select>
        {zoneId !== order.deliveryZoneId && <span className={hint}>{labels.zoneHint}</span>}
      </label>
      <label className={field}>
        {labels.note}
        <textarea
          value={note}
          maxLength={500}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
          className="border-[1.5px] border-black bg-white px-3.5 py-2.5 text-[16px] font-normal"
        />
      </label>
      {isGuest && <TurnstileWidget lang={lang} onToken={setBotToken} resetSignal={botReset} />}
      {error && (
        <p role="alert" className="text-sm font-semibold">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="min-h-12 bg-black px-6 font-bold text-white hover:bg-[#333333] disabled:opacity-60">
          {busy ? labels.saving : labels.save}
        </button>
        <button type="button" onClick={onCancel} className="min-h-12 px-4 font-semibold underline">
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}
