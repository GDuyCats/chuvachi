"use client";

import { useState, type InputHTMLAttributes } from "react";
import { useAdminI18n } from "./AdminI18n";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { className?: string };

// A password box with an eye button to show or hide what was typed.
// The password only becomes visible on this screen; nothing is sent or stored differently.
export function PasswordInput({ className = "", ...props }: Props) {
  const { t } = useAdminI18n();
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={`w-full pr-12 ${className}`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t.hidePassword : t.showPassword}
        aria-pressed={visible}
        title={visible ? t.hidePassword : t.showPassword}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-black"
      >
        <EyeIcon crossed={visible} />
      </button>
    </div>
  );
}

// Thin black line icon, matching the black and white look of the site.
function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <path d="M4 4l16 16" />}
    </svg>
  );
}
