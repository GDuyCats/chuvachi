import type { Locale } from "@/i18n/config";

const vietnameseCurrency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });
const englishNumber = new Intl.NumberFormat("en-US");

// 55000 -> "55.000 ₫" in Vietnamese, "55,000 VND" in English.
export function formatPrice(amount: number, locale: Locale): string {
  return locale === "vi" ? vietnameseCurrency.format(amount) : `${englishNumber.format(amount)} VND`;
}
