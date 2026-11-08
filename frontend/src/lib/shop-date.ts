// Dates in the shop's time zone (Vietnam, UTC+7), as YYYY-MM-DD text.
// Only for the browser: call these in effects or event handlers, never while rendering on the server.

export function vietnamTodayText(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// "2026-11-20" -> "2026-11-21"
export function nextDayText(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

// True when a cake marked "sold out up to and including soldOutUntil" can't be delivered today.
export function isSoldOutToday(soldOutUntil: string | null | undefined): boolean {
  return Boolean(soldOutUntil) && vietnamTodayText() <= (soldOutUntil as string);
}
