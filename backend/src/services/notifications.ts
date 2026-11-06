import { prisma } from "../lib/prisma";
import { escapeHtml, sendTelegram } from "../lib/telegram";
import { formatDateOnly } from "../lib/time";
import { describeItem } from "./order-service";

const ADMIN_URL = () => (process.env.ADMIN_URL ?? "http://localhost:3000/admin/orders").replace(/\/$/, "");

function money(amount: number): string {
  return `${amount.toLocaleString("vi-VN")} ₫`;
}

// "New order" message for staff. No name, phone or address (see lib/telegram.ts).
export async function notifyNewOrder(code: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { code },
    include: { items: true, deliveryZone: true },
  });
  if (!order) return;

  const settings = await prisma.shopSetting.findUnique({ where: { id: 1 }, select: { unpaidCancelMinutes: true } });
  const when =
    order.deliveryType === "ASAP"
      ? `ASAP · ${formatDateOnly(order.deliveryDate)}`
      : `${formatDateOnly(order.deliveryDate)} · ${order.deliverySlot ?? ""}`;
  const items = order.items
    .map((item) => `• ${item.quantity} × ${escapeHtml(describeItem(item.nameSnapshot, item.optionsSnapshot, "vi"))}`)
    .join("\n");

  const lines = [
    `🧁 <b>New order ${order.code}</b>`,
    `${money(order.total)} · ${order.totalPortions} portions`,
    `Delivery: ${escapeHtml(when)} · ${escapeHtml(order.deliveryZone.nameVi)}`,
    "",
    items,
    "",
    `Waiting for the bank transfer with message <code>${order.code}</code>.`,
  ];
  if (settings && settings.unpaidCancelMinutes > 0) {
    lines.push(`Auto-cancels in ${settings.unpaidCancelMinutes} min if not confirmed.`);
  }
  lines.push(`Open: ${escapeHtml(ADMIN_URL())}`);
  await sendTelegram(lines.join("\n"));
}

// Tells staff which unpaid orders were just cancelled, so a late payment can be caught.
export async function notifyAutoCancelled(codes: string[]): Promise<void> {
  if (codes.length === 0) return;
  await sendTelegram(
    [
      `⏰ <b>Auto-cancelled (not confirmed in time)</b>`,
      codes.map((code) => `<code>${code}</code>`).join(", "),
      "",
      "If one of these customers did pay, check the bank app and contact them.",
    ].join("\n"),
  );
}
