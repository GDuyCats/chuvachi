"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminApi, AdminApiError, type AdminAccount, type AdminRole, type TemporaryPasswordResult } from "@/lib/admin-api";
import { useAdminMe } from "./AdminShell";
import { useAdminI18n } from "./AdminI18n";
import { AdminCardsSkeleton } from "./AdminSkeletons";
import { useToast } from "./Toast";

const field = "h-11 w-full border-[1.5px] border-black bg-white px-3 text-[15px] font-normal";
const ROLES: AdminRole[] = ["STAFF", "ADMIN"];

// Admins create staff and admin accounts, reset forgotten passwords and switch accounts off.
// Passwords are never shown, except a fresh temporary one right after it is created.
export function AccountsPage() {
  const router = useRouter();
  const toast = useToast();
  const me = useAdminMe();
  const { t, lang } = useAdminI18n();
  const a = t.accounts;
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [temp, setTemp] = useState<TemporaryPasswordResult | null>(null);

  const handleError = useCallback(
    (error: unknown) => {
      if (error instanceof AdminApiError && error.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const code = error instanceof AdminApiError ? error.code : "UNKNOWN";
      toast.error(a.errors[code as keyof typeof a.errors] ?? a.errors.UNKNOWN);
    },
    [router, toast, a],
  );

  useEffect(() => {
    adminApi
      .listAccounts()
      .then(setAccounts)
      .catch((error: unknown) => {
        if (error instanceof AdminApiError && error.status === 401) {
          router.replace("/admin/login");
          return;
        }
        setLoadFailed(true);
      });
  }, [router]);

  function showTemporary(result: TemporaryPasswordResult) {
    setAccounts(result.accounts);
    setTemp(result);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loadFailed) {
    return <p className="border-[1.5px] border-black bg-white p-4 font-semibold">{a.loadError}</p>;
  }
  if (!accounts) {
    return <AdminCardsSkeleton label={a.loading} />;
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl uppercase md:text-[40px]">{a.title}</h1>
        <p className="text-sm text-muted">{a.hint}</p>
      </div>

      {temp && <TemporaryPasswordBox result={temp} onDone={() => setTemp(null)} />}

      <ul className="flex flex-col gap-3">
        {accounts.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            isSelf={account.id === me?.id}
            lang={lang}
            onSaved={(list) => {
              setAccounts(list);
              toast.success(a.saved);
            }}
            onReset={showTemporary}
            onError={handleError}
          />
        ))}
      </ul>

      <CreateAccountForm onCreated={showTemporary} onError={handleError} />
    </div>
  );
}

function TemporaryPasswordBox({ result, onDone }: { result: TemporaryPasswordResult; onDone: () => void }) {
  const { t } = useAdminI18n();
  const a = t.accounts.temp;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.temporaryPassword);
      setCopied(true);
    } catch {
      // Clipboard blocked: the password is still on screen to read out.
    }
  }

  return (
    <section role="status" className="flex flex-col gap-3 border-[1.5px] border-black bg-white p-5">
      <h2 className="text-lg font-bold">{a.title.replace("{name}", result.account.name)}</h2>
      <div className="flex flex-wrap items-center gap-3">
        <code className="bg-black px-4 py-2.5 text-xl font-bold tracking-[0.12em] text-white">{result.temporaryPassword}</code>
        <button type="button" onClick={copy} className="min-h-11 border-[1.5px] border-black px-4 text-sm font-bold">
          {copied ? a.copied : a.copy}
        </button>
      </div>
      <p className="text-sm">{result.account.email}</p>
      <p className="text-sm">{a.login}</p>
      <p className="text-xs text-muted">{a.hint}</p>
      <button type="button" onClick={onDone} className="min-h-11 self-start bg-black px-5 text-sm font-bold text-white">
        {a.done}
      </button>
    </section>
  );
}

type RowProps = {
  account: AdminAccount;
  isSelf: boolean;
  lang: "vi" | "en";
  onSaved: (accounts: AdminAccount[]) => void;
  onReset: (result: TemporaryPasswordResult) => void;
  onError: (error: unknown) => void;
};

function AccountRow({ account, isSelf, lang, onSaved, onReset, onError }: RowProps) {
  const { t } = useAdminI18n();
  const a = t.accounts;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.name);
  const [role, setRole] = useState<AdminRole>(account.role);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(account.name);
    setRole(account.role);
  }, [account]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  const save = (isActive: boolean) =>
    run(async () => {
      onSaved(await adminApi.updateAccount(account.id, { name: name.trim(), role, isActive }));
      setEditing(false);
    });

  const lastLogin = account.lastLoginAt
    ? new Date(account.lastLoginAt).toLocaleString(lang === "vi" ? "vi-VN" : "en-GB", { dateStyle: "short", timeStyle: "short" })
    : a.never;

  return (
    <li className={`flex flex-col gap-3 border bg-white p-4 ${account.isActive ? "border-[#e0e0e0]" : "border-dashed border-[#a8a8a8] opacity-70"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-bold">
            {account.name} {isSelf && <span className="font-normal text-muted">{a.you}</span>}
          </span>
          <span className="break-all text-sm">{account.email}</span>
          <span className="text-xs text-muted">
            {a.lastLogin}: {lastLogin}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className={`px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${account.role === "ADMIN" ? "bg-black text-white" : "border border-black"}`}>
            {t.roles[account.role]}
          </span>
          {!account.isActive && <span className="border border-black px-2 py-1 text-[11px] font-bold uppercase tracking-wider">{a.inactive}</span>}
          {account.locked && <span className="border border-black px-2 py-1 text-[11px] font-bold uppercase tracking-wider">{a.locked}</span>}
          {account.isActive && account.mustChangePassword && (
            <span className="border border-[#a8a8a8] px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-muted">{a.pendingPassword}</span>
          )}
        </div>
      </div>

      {editing ? (
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_180px_auto]">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {a.name}
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {a.role}
            <select value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as AdminRole)} className={field}>
              {ROLES.map((value) => (
                <option key={value} value={value}>
                  {t.roles[value]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={busy || !name.trim()} onClick={() => save(account.isActive)} className="min-h-11 bg-black px-4 text-sm font-bold text-white disabled:opacity-50">
              {a.save}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="min-h-11 px-3 text-sm font-semibold underline">
              {a.cancel}
            </button>
          </div>
        </div>
      ) : confirmingReset ? (
        <div className="flex flex-col gap-2 border-[1.5px] border-black p-3">
          <p className="text-sm">{a.resetConfirm.replace("{name}", account.name)}</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  onReset(await adminApi.resetPassword(account.id));
                  setConfirmingReset(false);
                })
              }
              className="min-h-11 bg-black px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {a.yesReset}
            </button>
            <button type="button" onClick={() => setConfirmingReset(false)} className="min-h-11 px-3 text-sm font-semibold underline">
              {a.no}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(true)} className="min-h-10 border-[1.5px] border-black px-3 text-sm font-bold">
            {a.edit}
          </button>
          {!isSelf && account.isActive && (
            <button type="button" onClick={() => setConfirmingReset(true)} className="min-h-10 border-[1.5px] border-black px-3 text-sm font-bold">
              {a.reset}
            </button>
          )}
          {!isSelf && (
            <button
              type="button"
              disabled={busy}
              title={a.turnOffHint}
              onClick={() => save(!account.isActive)}
              className="min-h-10 px-3 text-sm font-semibold underline disabled:opacity-50"
            >
              {account.isActive ? a.turnOff : a.turnOn}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function CreateAccountForm({
  onCreated,
  onError,
}: {
  onCreated: (result: TemporaryPasswordResult) => void;
  onError: (error: unknown) => void;
}) {
  const { t } = useAdminI18n();
  const a = t.accounts;
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<AdminRole>("STAFF");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      onCreated(await adminApi.createAccount({ email: email.trim(), name: name.trim(), role }));
      setEmail("");
      setName("");
      setRole("STAFF");
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="accounts-create" onSubmit={handleSubmit} className="flex scroll-mt-6 flex-col gap-4 border border-[#e0e0e0] bg-white p-5">
      <h2 className="font-display text-2xl uppercase tracking-wide">{a.create.title}</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_180px]">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {a.name}
          <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {a.email}
          <input required type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {a.role}
          <select value={role} onChange={(e) => setRole(e.target.value as AdminRole)} className={field}>
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {t.roles[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="submit" disabled={busy} className="min-h-11 self-start bg-black px-5 text-sm font-bold text-white disabled:opacity-50">
        {busy ? a.create.creating : a.create.submit}
      </button>
    </form>
  );
}
