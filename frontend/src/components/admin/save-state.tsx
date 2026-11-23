"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useAdminI18n } from "./AdminI18n";
import { useToast } from "./Toast";

// Shared "saved / unsaved" behaviour of the admin edit pages:
// - the Save button reads "✓ Saved" and can't be pressed while nothing changed,
// - leaving the page with unsaved changes asks first,
// - Ctrl+S (Cmd+S on a Mac) presses the Save button of the form being edited (see AdminShell).

// Same content? Key order doesn't matter, so { a, b } equals { b, a }.
export function sameData(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))
      : item,
  );
}

// Asks before leaving with unsaved changes: closing or reloading the tab, or clicking a link
// to another admin page.
export function useUnsavedGuard(dirty: boolean): void {
  const { t } = useAdminI18n();
  const message = t.unsaved.leave;

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return; // leaving the site: the browser asks (beforeunload)
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true); // before Next.js handles the link
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}

// Rows edited in place (each with its own Save), kept in step with the saved list from the
// server. When a new saved list arrives (another row saved, a switch flipped, rows dragged),
// rows still being typed in keep their text; their on/off and position follow the saved list,
// since those are saved by themselves.
export function useEditableRows<T extends { id: number; isActive?: boolean; sortOrder: number }>(
  saved: T[],
): [T[], Dispatch<SetStateAction<T[]>>] {
  const [rows, setRows] = useState(saved);
  const [lastSaved, setLastSaved] = useState(saved);
  if (lastSaved !== saved) {
    setLastSaved(saved);
    setRows((current) =>
      saved.map((item) => {
        const local = current.find((row) => row.id === item.id);
        const before = lastSaved.find((row) => row.id === item.id);
        if (!local || !before) return item;
        const typing = !sameData({ ...local, isActive: null, sortOrder: 0 }, { ...before, isActive: null, sortOrder: 0 });
        return typing ? { ...local, isActive: item.isActive, sortOrder: item.sortOrder } : item;
      }),
    );
  }
  return [rows, setRows];
}

type SaveButtonProps = {
  dirty: boolean;
  saving: boolean;
  label: string; // "Save" / "Create"
  savingLabel: string;
  type?: "submit" | "button";
  onClick?: () => void;
  disabled?: boolean; // other reasons it can't be pressed (e.g. a photo still uploading)
  idleLabel?: string; // shown when nothing to save; default "✓ Saved" (a new, empty form passes "Save")
  className?: string;
};

// The Save button plus a short "unsaved changes" note. Marked with data-save-button so Ctrl+S
// can find it.
export function SaveButton({
  dirty,
  saving,
  label,
  savingLabel,
  type = "submit",
  onClick,
  disabled = false,
  idleLabel,
  className = "",
}: SaveButtonProps) {
  const { t } = useAdminI18n();
  const u = t.unsaved;
  const canSave = dirty && !saving && !disabled;
  return (
    <span className="flex flex-wrap items-center gap-3">
      {dirty && !saving && !idleLabel && <span className="text-sm font-semibold">{u.changes}</span>}
      <button
        type={type}
        onClick={onClick}
        disabled={!canSave}
        data-save-button
        title={canSave ? u.shortcut : undefined}
        className={`min-h-11 px-6 font-bold ${
          dirty || saving ? "bg-black text-white hover:bg-[#333333] disabled:opacity-60" : "bg-[#e5e5e5] text-[#555555]"
        } disabled:cursor-not-allowed ${className}`}
      >
        {saving ? savingLabel : dirty ? label : (idleLabel ?? `✓ ${u.saved}`)}
      </button>
    </span>
  );
}

type QuickSwitchProps = {
  checked: boolean;
  onToggle: (next: boolean) => Promise<unknown>; // saves the change; throws when it fails
  name: string; // what it switches, read out by screen readers ("Christmas banner")
  disabled?: boolean;
};

// An on/off switch shown in a list, so an item can be turned on or off without opening it.
// It saves straight away and shows the new position while saving.
export function QuickSwitch({ checked, onToggle, name, disabled = false }: QuickSwitchProps) {
  const { t } = useAdminI18n();
  const q = t.quick;
  const toast = useToast();
  const [pending, setPending] = useState<boolean | null>(null); // the position being saved
  const shown = pending ?? checked;

  async function toggle(next: boolean) {
    setPending(next);
    try {
      await onToggle(next);
      toast.success(`${next ? q.turnedOn : q.turnedOff}: ${name}`);
    } catch {
      toast.error(q.failed);
    } finally {
      setPending(null);
    }
  }

  return (
    <input
      type="checkbox"
      role="switch"
      checked={shown}
      disabled={disabled || pending !== null}
      onChange={(event) => void toggle(event.target.checked)}
      aria-label={name}
      title={shown ? q.on : q.off}
      className="switch"
    />
  );
}
