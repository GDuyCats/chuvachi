"use client";

import { useEffect, useState, type FormEvent } from "react";
import { adminApi, AdminApiError, type AdminOrder, type ContactChanges } from "@/lib/admin-api";
import { fetchOrderSettings } from "@/lib/public-api";
import { useAdminI18n } from "./AdminI18n";

// Staff change an order's name, phone, address, zone or note (for example when the customer asks on Facebook).
// Only the fields that really changed are sent; the change is written in the order's history.
export function OrderContactForm({
  order,
  onSaved,
  onCancel,
}: {
  order: AdminOrder;
  onSaved: (order: AdminOrder) => void;
  onCancel: () => void;
}) {
  const { t, lang } = useAdminI18n();
  const e = t.orders.edit;
  const [name, setName] = useState(order.customerName);
  const [phone, setPhone] = useState(order.customerPhone);
  const [address, setAddress] = useState(order.address);
  const [zoneId, setZoneId] = useState(order.deliveryZoneId);
  const [note, setNote] = useState(order.note ?? "");
  const [zones, setZones] = useState<{ id: number; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOrderSettings(lang)
      .then((settings) => setZones(settings.deliveryZones))
      .catch(() => setZones([]));
  }, [lang]);

  // The order's own zone stays in the list even if the shop no longer delivers there.
  const zoneOptions = zones.some((zone) => zone.id === order.deliveryZoneId)
    ? zones
    : [{ id: order.deliveryZoneId, name: order.deliveryZone[lang] }, ...zones];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const changes: ContactChanges = {};
    if (name.trim() !== order.customerName) changes.customerName = name.trim();
    if (phone.trim() !== order.customerPhone) changes.customerPhone = phone.trim();
    if (address.trim() !== order.address) changes.address = address.trim();
    if (zoneId !== order.deliveryZoneId) changes.deliveryZoneId = zoneId;
    if ((note.trim() || null) !== order.note) changes.note = note.trim() || null;
    if (Object.keys(changes).length === 0) {
      onCancel();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSaved(await adminApi.editContact(order.code, changes));
    } catch (err) {
      const code = err instanceof AdminApiError ? err.code : "UNKNOWN";
      setError(e.errors[code as keyof typeof e.errors] ?? e.errors.UNKNOWN);
    } finally {
      setBusy(false);
    }
  }

  const field = "flex flex-col gap-1 text-sm font-semibold";
  const input = "h-11 border-[1.5px] border-black bg-white px-3 text-[15px] font-normal";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-[1.5px] border-black p-3.5">
      <span className="text-xs font-bold uppercase tracking-widest text-muted">{e.title}</span>
      <label className={field}>
        {e.name}
        <input value={name} required maxLength={100} onChange={(ev) => setName(ev.target.value)} className={input} />
      </label>
      <label className={field}>
        {e.phone}
        <input value={phone} required type="tel" maxLength={20} onChange={(ev) => setPhone(ev.target.value)} className={input} />
      </label>
      <label className={field}>
        {e.address}
        <textarea
          value={address}
          required
          minLength={5}
          maxLength={300}
          rows={2}
          onChange={(ev) => setAddress(ev.target.value)}
          className="border-[1.5px] border-black bg-white px-3 py-2 text-[15px] font-normal"
        />
      </label>
      <label className={field}>
        {e.zone}
        <select value={zoneId} onChange={(ev) => setZoneId(Number(ev.target.value))} className={input}>
          {zoneOptions.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </select>
      </label>
      <label className={field}>
        {e.note}
        <textarea
          value={note}
          maxLength={500}
          rows={2}
          onChange={(ev) => setNote(ev.target.value)}
          className="border-[1.5px] border-black bg-white px-3 py-2 text-[15px] font-normal"
        />
      </label>
      <p className="text-xs text-muted">{e.hint}</p>
      {error && <p className="text-sm font-semibold">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="min-h-11 flex-1 bg-black px-3 text-sm font-bold text-white disabled:opacity-60">
          {busy ? t.orders.actions.working : e.save}
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 flex-1 border-[1.5px] border-black px-3 text-sm font-bold">
          {e.cancel}
        </button>
      </div>
    </form>
  );
}
