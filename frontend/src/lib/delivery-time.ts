// Date and time-slot helpers for the checkout page. All shop times are Vietnam time (UTC+7).
// "Calendar dates" are YYYY-MM-DD strings; we do the math in UTC to avoid the visitor's time zone.

import type { Locale } from "@/i18n/config";

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function dateToUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// The next days the shop delivers on (skipping closed weekdays), starting today.
export function deliveryDays(today: string, maxDaysAhead: number, closedWeekdays: number[]): string[] {
  const start = dateToUtc(today);
  const days: string[] = [];
  for (let i = 0; i <= maxDaysAhead; i += 1) {
    const ms = start + i * DAY_MS;
    if (!closedWeekdays.includes(new Date(ms).getUTCDay())) {
      days.push(utcToDate(ms));
    }
  }
  return days;
}

// The real moment a slot like "14:00-16:00" starts on a given date.
export function slotStartMs(date: string, slot: string): number {
  const [start] = slot.split("-");
  const [hours, minutes] = start.split(":").map(Number);
  return dateToUtc(date) + (hours * 60 + minutes) * 60 * 1000 - VIETNAM_OFFSET_MS;
}

// "14:00-16:00" -> "14:00 – 16:00"
export function formatSlot(slot: string): string {
  return slot.replace("-", " – ");
}

// "2026-11-07" -> { weekday: "Sat", day: "7/11" } in the visitor's language.
export function formatDay(date: string, locale: Locale): { weekday: string; day: string } {
  const value = new Date(dateToUtc(date));
  const tag = locale === "vi" ? "vi-VN" : "en-US";
  return {
    weekday: new Intl.DateTimeFormat(tag, { weekday: "short", timeZone: "UTC" }).format(value),
    day: new Intl.DateTimeFormat(tag, { day: "numeric", month: "numeric", timeZone: "UTC" }).format(value),
  };
}

// Full date for summaries, e.g. "Saturday, 7 November".
export function formatLongDate(date: string, locale: Locale): string {
  const tag = locale === "vi" ? "vi-VN" : "en-US";
  return new Intl.DateTimeFormat(tag, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(dateToUtc(date)),
  );
}
