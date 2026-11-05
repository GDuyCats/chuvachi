// Time helpers for the shop. Vietnam is always UTC+7 (no daylight saving time).
// Calendar dates (like a delivery date) are stored as midnight UTC of that day.

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Parses "YYYY-MM-DD" into a date. Returns null for invalid dates like 2026-02-30.
export function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  const isSameDay =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return isSameDay ? date : null;
}

// Formats a calendar date as "YYYY-MM-DD".
export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Today's calendar date in Vietnam.
export function vietnamToday(now: Date = new Date()): Date {
  const local = new Date(now.getTime() + VIETNAM_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

// Whole days from one calendar date to another.
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

// The real moment a delivery slot starts, e.g. date 2026-11-06 + "14:00-16:00" -> 14:00 Vietnam time.
export function slotStartTime(date: Date, slot: string): Date {
  const [start] = slot.split("-");
  const [hours, minutes] = start.split(":").map(Number);
  return new Date(date.getTime() + (hours * 60 + minutes) * 60 * 1000 - VIETNAM_OFFSET_MS);
}
