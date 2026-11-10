import type { Locale } from "@/i18n/config";

// "10 tháng 11, 2026" / "10 November 2026". A fixed time zone so the server and the browser
// print the same date.
export function formatPostDate(iso: string, lang: Locale): string {
  return new Date(iso).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}
