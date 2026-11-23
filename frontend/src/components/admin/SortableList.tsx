"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useAdminI18n } from "./AdminI18n";
import { useToast } from "./Toast";

// A list whose rows can be put in a new order by dragging their handle (⠿).
// - Mouse: press the handle and drag.
// - Phone: hold the handle a moment, then drag (so a quick swipe never moves a row by mistake).
// - Keyboard: focus the handle, then ↑ ↓ (or ← →) move the row one place.
// The new order is saved as soon as the row is dropped (onReorder); if saving fails the list
// goes back to how it was. Works for a single column and for grids.

type Key = number | string;

type SortableListProps<T> = {
  items: T[];
  getKey: (item: T) => Key;
  onReorder: (ordered: T[]) => Promise<unknown>; // saves; throws when it fails
  renderItem: (item: T, handle: ReactNode, dragging: boolean) => ReactNode;
  itemClassName?: string | ((item: T) => string);
  className?: string;
  disabled?: boolean; // e.g. while one of the rows is being edited
  as?: "ul" | "div";
  quiet?: boolean; // no "Order saved" message: the order is part of a form that has its own Save
};

const HOLD_MS = 220; // touch: how long to hold the handle before the row lifts
const EDGE = 64; // px from the window edge where the page scrolls by itself while dragging

type Drag = {
  key: Key;
  pointerId: number;
  grabX: number; // where the row was grabbed, inside the row
  grabY: number;
  x: number; // pointer now
  y: number;
  started: boolean;
  startX: number;
  startY: number;
  timer: number | null;
};

export function SortableList<T>({
  items,
  getKey,
  onReorder,
  renderItem,
  itemClassName = "",
  className = "",
  disabled = false,
  as: Tag = "ul",
  quiet = false,
}: SortableListProps<T>) {
  const { t } = useAdminI18n();
  const s = t.sort;
  const toast = useToast();
  const [order, setOrder] = useState<Key[] | null>(null); // set while dragging or saving
  const [draggingKey, setDraggingKey] = useState<Key | null>(null);
  const [saving, setSaving] = useState(false);
  const rows = useRef(new Map<Key, HTMLElement>());
  const drag = useRef<Drag | null>(null);
  const orderRef = useRef<Key[] | null>(null);
  const focusKey = useRef<Key | null>(null);
  const scrollFrame = useRef<number | null>(null);
  const stopListening = useRef<(() => void) | null>(null);

  const byKey = new Map(items.map((item) => [getKey(item), item]));
  const shown = order ? order.flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : [])) : items;

  function setLiveOrder(next: Key[] | null) {
    orderRef.current = next;
    setOrder(next);
  }

  // The window listeners of a drag call the newest versions of these (they see the newest list).
  const live = useRef({ move: (_event: globalThis.PointerEvent) => {}, end: (_keep: boolean) => {} });
  useLayoutEffect(() => {
    live.current = { move: onPointerMove, end };
  });

  // After the rows moved in the page, put the dragged row back under the pointer.
  useLayoutEffect(() => {
    if (drag.current?.started) placeDragged();
  });

  // Keep the keyboard focus on the handle of a row that was just moved with the arrow keys.
  useEffect(() => {
    if (focusKey.current === null) return;
    rows.current.get(focusKey.current)?.querySelector<HTMLElement>("[data-sort-handle]")?.focus();
    focusKey.current = null;
  });

  useEffect(
    () => () => {
      stopListening.current?.();
      if (drag.current?.timer) window.clearTimeout(drag.current.timer);
      if (scrollFrame.current) window.cancelAnimationFrame(scrollFrame.current);
      document.body.style.userSelect = "";
    },
    [],
  );

  async function save(nextKeys: Key[]) {
    const before = items.map(getKey);
    if (nextKeys.every((key, index) => key === before[index])) {
      setLiveOrder(null);
      return;
    }
    setSaving(true);
    try {
      await onReorder(nextKeys.flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : [])));
      if (!quiet) toast.success(s.saved);
    } catch {
      toast.error(s.failed);
    } finally {
      setSaving(false);
      setLiveOrder(null); // the list now follows the saved items again (or the old order after an error)
    }
  }

  // Puts the dragged row where the pointer is, then moves the row's picture under the pointer.
  // A row swaps places once the pointer is past its middle (going down/right past the middle of a
  // row below, or up/left past the middle of a row above), so rows of different sizes don't flicker.
  function follow() {
    const current = drag.current;
    const dragged = current ? rows.current.get(current.key) : undefined;
    if (!current?.started || !dragged) return;
    const keys = orderRef.current ?? items.map(getKey);
    const from = keys.indexOf(current.key);
    const saved = dragged.style.transform;
    dragged.style.transform = "";
    const slot = dragged.getBoundingClientRect(); // where the dragged row sits in the list now
    dragged.style.transform = saved;
    for (const [key, element] of rows.current) {
      if (key === current.key) continue;
      const rect = element.getBoundingClientRect();
      if (current.x < rect.left || current.x > rect.right || current.y < rect.top || current.y > rect.bottom) continue;
      const to = keys.indexOf(key);
      const sameLine = Math.abs(rect.top - slot.top) < Math.min(rect.height, slot.height) / 2;
      const middleX = rect.left + rect.width / 2;
      const middleY = rect.top + rect.height / 2;
      const past = to > from ? (sameLine ? current.x > middleX : current.y > middleY) : sameLine ? current.x < middleX : current.y < middleY;
      if (!past) break;
      const next = [...keys];
      next.splice(from, 1);
      next.splice(to, 0, current.key);
      setLiveOrder(next);
      break;
    }
    placeDragged();
  }

  function placeDragged() {
    const current = drag.current;
    const element = current ? rows.current.get(current.key) : undefined;
    if (!current || !element) return;
    element.style.transform = "";
    const rect = element.getBoundingClientRect();
    element.style.transform = `translate(${current.x - current.grabX - rect.left}px, ${current.y - current.grabY - rect.top}px)`;
  }

  // Scrolls the page while the pointer is held near the top or bottom edge.
  function autoScroll() {
    const current = drag.current;
    if (!current?.started) {
      scrollFrame.current = null;
      return;
    }
    const step = current.y < EDGE ? -12 : current.y > window.innerHeight - EDGE ? 12 : 0;
    if (step !== 0) {
      window.scrollBy(0, step);
      follow();
    }
    scrollFrame.current = window.requestAnimationFrame(autoScroll);
  }

  function lift() {
    const current = drag.current;
    if (!current) return;
    current.started = true;
    current.timer = null;
    setDraggingKey(current.key);
    setLiveOrder(items.map(getKey));
    document.body.style.userSelect = "none";
    navigator.vibrate?.(10); // a small buzz on phones that support it: "picked up"
    if (!scrollFrame.current) scrollFrame.current = window.requestAnimationFrame(autoScroll);
  }

  function end(keep: boolean) {
    stopListening.current?.();
    stopListening.current = null;
    const current = drag.current;
    if (!current) return;
    if (current.timer) window.clearTimeout(current.timer);
    const element = rows.current.get(current.key);
    if (element) element.style.transform = "";
    drag.current = null;
    document.body.style.userSelect = "";
    setDraggingKey(null);
    if (!current.started) return;
    if (keep && orderRef.current) void save(orderRef.current);
    else setLiveOrder(null);
  }

  function onPointerDown(key: Key, event: PointerEvent<HTMLButtonElement>) {
    if (disabled || saving || drag.current || event.button !== 0) return;
    const element = rows.current.get(key);
    if (!element) return;
    event.preventDefault();
    const rect = element.getBoundingClientRect();
    drag.current = {
      key,
      pointerId: event.pointerId,
      grabX: event.clientX - rect.left,
      grabY: event.clientY - rect.top,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      timer: null,
    };
    if (event.pointerType === "touch") drag.current.timer = window.setTimeout(lift, HOLD_MS);
    // Listen on the whole window: while rows change places the handle itself may be moved in
    // the page, and it would then miss the pointer events.
    const pointerId = event.pointerId;
    const move = (moveEvent: globalThis.PointerEvent) => live.current.move(moveEvent);
    const up = (upEvent: globalThis.PointerEvent) => {
      if (upEvent.pointerId === pointerId) live.current.end(upEvent.type === "pointerup");
    };
    const onKey = (keyEvent: globalThis.KeyboardEvent) => {
      if (keyEvent.key === "Escape") live.current.end(false); // put the row back
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", onKey);
    stopListening.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", onKey);
    };
  }

  function onPointerMove(event: globalThis.PointerEvent) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.x = event.clientX;
    current.y = event.clientY;
    const moved = Math.hypot(current.x - current.startX, current.y - current.startY);
    if (!current.started) {
      if (event.pointerType === "touch") {
        if (moved > 10) end(false); // moved before the hold finished: not a drag
        return;
      }
      if (moved < 4) return;
      lift();
    }
    follow();
  }

  function onKeyDown(key: Key, event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : 0;
    if (step === 0 || disabled || saving) return;
    event.preventDefault();
    const keys = items.map(getKey);
    const from = keys.indexOf(key);
    const to = from + step;
    if (to < 0 || to >= keys.length) return;
    keys.splice(from, 1);
    keys.splice(to, 0, key);
    focusKey.current = key;
    setLiveOrder(keys);
    void save(keys);
  }

  return (
    <Tag className={className} aria-busy={saving || undefined}>
      {shown.map((item) => {
        const key = getKey(item);
        const isDragging = draggingKey === key;
        const handle = (
          <button
            type="button"
            data-sort-handle
            disabled={disabled}
            aria-label={s.handle}
            title={s.handle}
            onPointerDown={(event) => onPointerDown(key, event)}
            onKeyDown={(event) => onKeyDown(key, event)}
            onContextMenu={(event) => event.preventDefault()}
            className={`flex h-11 w-9 shrink-0 touch-none select-none items-center justify-center text-xl leading-none text-[#777777] hover:text-black disabled:cursor-not-allowed disabled:opacity-30 ${
              isDragging ? "cursor-grabbing" : "cursor-grab"
            }`}
          >
            ⠿
          </button>
        );
        const extra = typeof itemClassName === "function" ? itemClassName(item) : itemClassName;
        const ItemTag = Tag === "ul" ? "li" : "div";
        return (
          <ItemTag
            key={key}
            ref={(element: HTMLElement | null) => {
              if (element) rows.current.set(key, element);
              else rows.current.delete(key);
            }}
            className={`${extra} ${isDragging ? "relative z-20 shadow-[0_8px_24px_rgba(0,0,0,0.18)]" : ""}`}
          >
            {renderItem(item, handle, isDragging)}
          </ItemTag>
        );
      })}
    </Tag>
  );
}
