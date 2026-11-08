"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { adminApi, AdminApiError } from "@/lib/admin-api";
import { AdminLanguageSwitch, useAdminI18n } from "./AdminI18n";
import { PasswordInput } from "./PasswordInput";

const MIN_LENGTH = 12; // same rule as the server
const input = "h-12 border-[1.5px] border-black px-3.5 text-base font-normal";

// Same black page and white card as the sign-in page.
function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <div className="flex justify-end p-4">
        <AdminLanguageSwitch />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="flex w-full max-w-sm flex-col gap-5 bg-white p-7 text-ink">
          <div className="flex flex-col gap-1">
            <span className="font-display text-3xl tracking-[0.18em]">CHUVACHI</span>
            <h1 className="text-sm font-bold uppercase tracking-widest text-muted">{title}</h1>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <p role="alert" className="border-[1.5px] border-black p-3 text-sm font-semibold">
      {text}
    </p>
  );
}

// Step 1: ask for the email. The answer is the same whether or not the email has an account.
export function ForgotPasswordForm() {
  const { t } = useAdminI18n();
  const f = t.forgot;
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setErrorCode(null);
    try {
      await adminApi.requestPasswordReset(email.trim());
      setSent(true);
    } catch (error) {
      setErrorCode(error instanceof AdminApiError ? error.code : "UNKNOWN");
    } finally {
      setSending(false);
    }
  }

  const errorText = errorCode ? (f.errors[errorCode as keyof typeof f.errors] ?? f.errors.UNKNOWN) : null;

  if (sent) {
    return (
      <AuthCard title={f.sentTitle}>
        <p className="text-sm">{f.sent}</p>
        <p className="text-xs text-muted">{f.noEmail}</p>
        <Link href="/admin/login" className="flex min-h-12 items-center justify-center bg-black font-bold text-white">
          {f.back}
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={f.title}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <p className="text-sm">{f.hint}</p>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {f.email}
          <input
            required
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
          />
        </label>
        {errorText && <ErrorBox text={errorText} />}
        <button type="submit" disabled={sending} className="min-h-12 bg-black font-bold text-white hover:bg-[#333333] disabled:opacity-60">
          {sending ? f.sending : f.submit}
        </button>
        <Link href="/admin/login" className="self-center py-1 text-sm font-semibold underline">
          {f.back}
        </Link>
      </form>
    </AuthCard>
  );
}

// Step 2: the page opened from the email link. The token sits after "#" in the link,
// so it is never sent to any server in the address and is removed from the address bar at once.
export function ResetPasswordForm() {
  const { t } = useAdminI18n();
  const f = t.forgot;
  const p = t.password;
  const [token, setToken] = useState<string | null | undefined>(undefined); // undefined = not read yet
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    const match = window.location.hash.match(/token=([A-Za-z0-9_-]+)/);
    setToken(match ? match[1] : null);
    if (match) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    if (next.length < MIN_LENGTH) return setErrorText(p.errors.TOO_SHORT);
    if (next !== repeat) return setErrorText(p.errors.MISMATCH);

    setSaving(true);
    setErrorText(null);
    try {
      await adminApi.confirmPasswordReset(token, next);
      setDone(true);
    } catch (error) {
      const code = error instanceof AdminApiError ? error.code : "UNKNOWN";
      setErrorText(code === "PASSWORD_TOO_SHORT" ? p.errors.TOO_SHORT : (f.errors[code as keyof typeof f.errors] ?? f.errors.UNKNOWN));
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <AuthCard title={f.resetTitle}>
        <p className="text-sm font-semibold">{f.resetDone}</p>
        <Link href="/admin/login" className="flex min-h-12 items-center justify-center bg-black font-bold text-white">
          {f.goLogin}
        </Link>
      </AuthCard>
    );
  }

  if (token === null) {
    return (
      <AuthCard title={f.resetTitle}>
        <ErrorBox text={f.errors.NO_TOKEN} />
        <Link href="/admin/forgot-password" className="self-center py-1 text-sm font-semibold underline">
          {f.link}
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={f.resetTitle}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {p.new}
          <PasswordInput
            required
            autoComplete="new-password"
            minLength={MIN_LENGTH}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {p.repeat}
          <PasswordInput required autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} className={input} />
        </label>
        <p className="text-xs text-muted">{p.hint}</p>
        {errorText && <ErrorBox text={errorText} />}
        <button
          type="submit"
          disabled={saving || !token}
          className="min-h-12 bg-black font-bold text-white hover:bg-[#333333] disabled:opacity-60"
        >
          {saving ? f.resetSaving : f.resetSave}
        </button>
        {errorText === f.errors.LINK_INVALID && (
          <Link href="/admin/forgot-password" className="self-center py-1 text-sm font-semibold underline">
            {f.link}
          </Link>
        )}
      </form>
    </AuthCard>
  );
}
