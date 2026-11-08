"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { accountApi, type AccountOrder, type CustomerProfile } from "@/lib/account-api";
import { formatLongDate, formatSlot } from "@/lib/delivery-time";
import { formatPrice } from "@/lib/format";
import { ApiError, fetchOrderSettings } from "@/lib/public-api";
import { Skeleton, SkeletonGroup } from "../Skeleton";
import { AccountPushSetting } from "../push/PushControls";
import { AccountReviews } from "../reviews/ReviewableOrders";

type Props = {
  lang: Locale;
  labels: Dictionary["account"];
  statusLabels: Dictionary["track"]["steps"];
  cancelReasons: Dictionary["cancelReasons"];
  reviewLabels: Dictionary["reviews"];
  pushLabels: Dictionary["push"];
};

type Notice = { kind: "ok" | "error"; text: string } | null;

const inputClass = "h-12 w-full border-[1.5px] border-black px-3.5 text-base font-normal";

// The signed-in customer's page: their details, their orders, and account actions.
export function AccountView({ lang, labels, statusLabels, cancelReasons, reviewLabels, pushLabels }: Props) {
  const router = useRouter();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [zones, setZones] = useState<{ id: number; name: string }[]>([]);
  const [failed, setFailed] = useState(false);

  async function loadOrders() {
    setOrders(await accountApi.orders(lang));
  }

  useEffect(() => {
    Promise.all([accountApi.me(), accountApi.orders(lang)])
      .then(([me, list]) => {
        setProfile(me);
        setOrders(list);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
          router.replace(`/${lang}/login?next=${encodeURIComponent(`/${lang}/account`)}`);
          return;
        }
        setFailed(true);
      });
    // Delivery areas for the address form; the page still works without them.
    fetchOrderSettings(lang)
      .then((settings) => setZones(settings.deliveryZones))
      .catch(() => {});
  }, [lang, router]);

  if (failed) {
    return (
      <p role="alert" className="border-[1.5px] border-black p-5 font-semibold">
        {labels.errors.UNKNOWN}
      </p>
    );
  }
  if (!profile) {
    return (
      <SkeletonGroup label={labels.loading} className="flex flex-col gap-8">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </SkeletonGroup>
    );
  }

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-wrap items-center gap-4">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- small Google profile photo
          <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black font-display text-2xl text-white">
            {profile.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="font-display text-4xl uppercase leading-none md:text-6xl">{labels.hello.replace("{name}", profile.name)}</h1>
          <span className="truncate text-muted">{profile.email}</span>
        </div>
      </header>

      <OrdersSection lang={lang} labels={labels} statusLabels={statusLabels} cancelReasons={cancelReasons} orders={orders} />
      <AccountPushSetting lang={lang} labels={pushLabels} />
      <AccountReviews lang={lang} labels={reviewLabels} />
      <ClaimSection labels={labels} onClaimed={loadOrders} />
      <ProfileSection labels={labels} profile={profile} zones={zones} onSaved={setProfile} />
      <DangerSection lang={lang} labels={labels} />
    </div>
  );
}

function OrdersSection({
  lang,
  labels,
  statusLabels,
  cancelReasons,
  orders,
}: {
  lang: Locale;
  labels: Dictionary["account"];
  statusLabels: Dictionary["track"]["steps"];
  cancelReasons: Dictionary["cancelReasons"];
  orders: AccountOrder[];
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-[28px] uppercase tracking-wide">{labels.ordersTitle}</h2>
      {orders.length === 0 ? (
        <div className="flex flex-col items-start gap-3 border border-dashed border-[#a8a8a8] p-6">
          <p className="text-muted">{labels.noOrders}</p>
          <Link href={`/${lang}/menu`} className="flex min-h-11 items-center bg-black px-6 font-bold text-white">
            {labels.toMenu}
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => {
            const status = order.status === "CANCELLED" ? labels.cancelled : statusLabels[order.status];
            const when =
              order.deliveryType === "ASAP"
                ? `${labels.asap} · ${formatLongDate(order.deliveryDate, lang)}`
                : `${formatLongDate(order.deliveryDate, lang)}${order.deliverySlot ? ` · ${formatSlot(order.deliverySlot)}` : ""}`;
            return (
              <li key={order.code}>
                <Link
                  href={`/${lang}/track?code=${order.code}`}
                  className="flex flex-col gap-2 bg-surface p-4 transition-colors hover:bg-[#ececec] md:p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold tracking-[0.06em]">{order.code}</span>
                    <span
                      className={`px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${
                        order.status === "CANCELLED" ? "border border-black" : "bg-black text-white"
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                  <span className="text-sm text-[#333333]">
                    {order.items.map((item) => `${item.quantity} × ${item.name}`).join(", ")}
                  </span>
                  {order.status === "CANCELLED" && order.cancelReason && (
                    <span className="text-sm text-muted">
                      {cancelReasons[order.cancelReason]}
                      {order.cancelNote ? ` — ${order.cancelNote}` : ""}
                    </span>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-muted">{when}</span>
                    <span className="font-bold">{formatPrice(order.total, lang)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ClaimSection({ labels, onClaimed }: { labels: Dictionary["account"]; onClaimed: () => Promise<void> }) {
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await accountApi.claimOrder(code.trim().toUpperCase(), phone.trim());
      await onClaimed();
      setCode("");
      setPhone("");
      setNotice({ kind: "ok", text: labels.claimDone });
    } catch (error) {
      const errorCode = error instanceof ApiError ? error.code : "UNKNOWN";
      setNotice({ kind: "error", text: labels.errors[errorCode as keyof typeof labels.errors] ?? labels.errors.UNKNOWN });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[28px] uppercase tracking-wide">{labels.claimTitle}</h2>
        <p className="text-[15px] text-muted">{labels.claimHint}</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-semibold">
          {labels.code}
          <input
            required
            maxLength={12}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className={`${inputClass} tracking-[0.08em]`}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-semibold">
          {labels.phone}
          <input
            required
            type="tel"
            inputMode="tel"
            maxLength={20}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
          />
        </label>
        <button type="submit" disabled={busy} className="h-12 border-[1.5px] border-black px-6 font-bold disabled:opacity-60">
          {busy ? labels.working : labels.claim}
        </button>
      </form>
      {notice && <NoticeBox notice={notice} />}
    </section>
  );
}

function ProfileSection({
  labels,
  profile,
  zones,
  onSaved,
}: {
  labels: Dictionary["account"];
  profile: CustomerProfile;
  zones: { id: number; name: string }[];
  onSaved: (profile: CustomerProfile) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [zoneId, setZoneId] = useState(profile.defaultZoneId ? String(profile.defaultZoneId) : "");
  const [address, setAddress] = useState(profile.defaultAddress ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      onSaved(
        await accountApi.updateMe({
          name: name.trim(),
          phone: phone.trim(),
          defaultAddress: address.trim(),
          defaultZoneId: zoneId ? Number(zoneId) : null,
        }),
      );
      setNotice({ kind: "ok", text: labels.saved });
    } catch (error) {
      const errorCode = error instanceof ApiError ? error.code : "UNKNOWN";
      setNotice({ kind: "error", text: labels.errors[errorCode as keyof typeof labels.errors] ?? labels.errors.UNKNOWN });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[28px] uppercase tracking-wide">{labels.detailsTitle}</h2>
        <p className="text-[15px] text-muted">{labels.detailsHint}</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {labels.name}
            <input required maxLength={100} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {labels.phone}
            <input
              type="tel"
              inputMode="tel"
              maxLength={20}
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {labels.area}
            <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={`${inputClass} bg-white`}>
              <option value="">{labels.areaNone}</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {labels.address}
            <input
              maxLength={300}
              autoComplete="street-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <button type="submit" disabled={busy} className="min-h-12 self-start bg-black px-8 font-bold text-white hover:bg-[#333333] disabled:opacity-60">
          {busy ? labels.working : labels.save}
        </button>
      </form>
      {notice && <NoticeBox notice={notice} />}
    </section>
  );
}

function DangerSection({ lang, labels }: { lang: Locale; labels: Dictionary["account"] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      router.replace(`/${lang}`);
    } catch {
      setNotice({ kind: "error", text: labels.errors.UNKNOWN });
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 border-t border-line pt-8">
      <button
        type="button"
        disabled={busy}
        onClick={() => run(accountApi.signOut)}
        className="min-h-12 self-start border-[1.5px] border-black px-8 font-bold disabled:opacity-60"
      >
        {labels.signOut}
      </button>
      {!confirming ? (
        <button type="button" onClick={() => setConfirming(true)} className="self-start py-2 text-sm text-muted underline">
          {labels.deleteAccount}
        </button>
      ) : (
        <div className="animate-pop-in flex flex-col gap-3 border-[1.5px] border-black p-4">
          <p className="text-[15px]">{labels.deleteExplain}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(accountApi.deleteMe)}
              className="min-h-11 bg-black px-5 text-sm font-bold text-white disabled:opacity-60"
            >
              {labels.deleteConfirm}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="min-h-11 border-[1.5px] border-black px-5 text-sm font-bold">
              {labels.keep}
            </button>
          </div>
        </div>
      )}
      {notice && <NoticeBox notice={notice} />}
    </section>
  );
}

function NoticeBox({ notice }: { notice: NonNullable<Notice> }) {
  return (
    <p
      role={notice.kind === "error" ? "alert" : "status"}
      className={`animate-pop-in p-3.5 text-sm font-semibold ${notice.kind === "error" ? "border-[1.5px] border-black" : "bg-surface"}`}
    >
      {notice.kind === "ok" ? "✓ " : ""}
      {notice.text}
    </p>
  );
}
