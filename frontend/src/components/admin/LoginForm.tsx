"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { adminApi, AdminApiError } from "@/lib/admin-api";
import { AdminLanguageSwitch, useAdminI18n } from "./AdminI18n";
import { PasswordInput } from "./PasswordInput";

export function LoginForm() {
  const router = useRouter();
  const { t } = useAdminI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorCode(null);
    try {
      await adminApi.login(email.trim(), password);
      router.replace("/admin/orders");
    } catch (error) {
      setErrorCode(error instanceof AdminApiError ? error.code : "UNKNOWN");
      setPassword("");
      setSubmitting(false);
    }
  }

  const errors = t.login.errors;
  const errorText = errorCode ? (errors[errorCode as keyof typeof errors] ?? errors.UNKNOWN) : null;

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <div className="flex justify-end p-4">
        <AdminLanguageSwitch />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-5 bg-white p-7 text-ink">
          <div className="flex flex-col gap-1">
            <span className="font-display text-3xl tracking-[0.18em]">CHUVACHI</span>
            <h1 className="text-sm font-bold uppercase tracking-widest text-muted">{t.login.title}</h1>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {t.login.email}
            <input
              required
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 border-[1.5px] border-black px-3.5 text-base font-normal"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {t.login.password}
            <PasswordInput
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 border-[1.5px] border-black px-3.5 text-base font-normal"
            />
          </label>
          {errorText && (
            <p role="alert" className="border-[1.5px] border-black p-3 text-sm font-semibold">
              {errorText}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="min-h-12 bg-black font-bold text-white hover:bg-[#333333] disabled:opacity-60"
          >
            {submitting ? t.login.submitting : t.login.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
