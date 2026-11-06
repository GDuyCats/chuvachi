"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAdminI18n } from "./AdminI18n";

// Small pop-up messages ("Saved", "Something went wrong") that appear at the bottom of the
// screen, so staff always see the result of a button press even when the page is scrolled.

type ToastKind = "success" | "error";
type Toast = { id: number; kind: ToastKind; text: string };
type ToastApi = { success: (text: string) => void; error: (text: string) => void };

const ToastContext = createContext<ToastApi | null>(null);

const SUCCESS_MS = 3500;
const ERROR_MS = 7000;
const MAX_VISIBLE = 3;

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, text: string) => {
    const id = nextId.current++;
    // The same message twice in a row replaces the old one instead of stacking up.
    setToasts((current) => [...current.filter((t) => t.text !== text), { id, kind, text }].slice(-MAX_VISIBLE));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ success: (text) => push("success", text), error: (text) => push("error", text) }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 md:items-end md:p-6">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: (id: number) => void }) {
  const { t } = useAdminI18n();
  const isError = toast.kind === "error";

  useEffect(() => {
    const timer = window.setTimeout(() => onClose(toast.id), isError ? ERROR_MS : SUCCESS_MS);
    return () => window.clearTimeout(timer);
  }, [isError, onClose, toast.id]);

  return (
    <div
      role={isError ? "alert" : "status"}
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 border-[1.5px] border-black px-4 py-3.5 shadow-[0_8px_24px_rgba(0,0,0,0.18)] motion-safe:animate-[toast-in_180ms_ease-out] ${
        isError ? "bg-white text-black" : "bg-black text-white"
      }`}
    >
      <span aria-hidden="true" className="text-lg leading-6 font-bold">
        {isError ? "!" : "✓"}
      </span>
      <p className="flex-1 text-[15px] leading-6 font-semibold">{toast.text}</p>
      <button type="button" onClick={() => onClose(toast.id)} aria-label={t.close} className="-m-2 p-2 text-lg leading-6">
        ×
      </button>
    </div>
  );
}
