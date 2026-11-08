"use client";

import { useState, type FormEvent } from "react";
import { adminApi, AdminApiError, type AdminMe } from "@/lib/admin-api";
import { useAdminI18n } from "./AdminI18n";
import { PasswordInput } from "./PasswordInput";
import { useToast } from "./Toast";

const MIN_LENGTH = 12; // same rule as the server

type Props = {
  forced?: boolean; // signed in with a temporary password: must change it before using the admin
  onChanged?: (me: AdminMe) => void;
};

// Lets a signed-in person replace their own password. Asks for the current one first,
// so someone who finds an unlocked phone can't take over the account.
export function ChangePasswordForm({ forced = false, onChanged }: Props) {
  const { t } = useAdminI18n();
  const toast = useToast();
  const p = t.password;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorCode, setErrorCode] = useState<keyof typeof p.errors | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (next.length < MIN_LENGTH) return setErrorCode("TOO_SHORT");
    if (next !== repeat) return setErrorCode("MISMATCH");

    setSaving(true);
    setErrorCode(null);
    try {
      const me = await adminApi.changePassword(current, next);
      setCurrent("");
      setNext("");
      setRepeat("");
      toast.success(p.saved);
      onChanged?.(me);
    } catch (error) {
      const code = error instanceof AdminApiError ? error.code : "UNKNOWN";
      setErrorCode(
        code === "PASSWORD_TOO_SHORT" ? "TOO_SHORT" : code in p.errors ? (code as keyof typeof p.errors) : "UNKNOWN",
      );
    } finally {
      setSaving(false);
    }
  }

  const input = "h-12 border-[1.5px] border-black px-3.5 text-base font-normal";

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-5 border-[1.5px] border-black bg-white p-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-2xl uppercase tracking-wide">{forced ? p.forcedTitle : p.title}</h1>
        {forced && <p className="text-sm">{p.forcedHint}</p>}
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        {forced ? p.currentTemp : p.current}
        <PasswordInput
          required
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className={input}
        />
      </label>
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
        <PasswordInput
          required
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          className={input}
        />
      </label>
      <p className="text-xs text-muted">{p.hint}</p>
      {errorCode && (
        <p role="alert" className="border-[1.5px] border-black p-3 text-sm font-semibold">
          {p.errors[errorCode]}
        </p>
      )}
      <button
        type="submit"
        disabled={saving}
        className="min-h-12 bg-black font-bold text-white hover:bg-[#333333] disabled:opacity-60"
      >
        {saving ? p.saving : p.save}
      </button>
    </form>
  );
}
