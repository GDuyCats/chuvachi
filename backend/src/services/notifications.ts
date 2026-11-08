import text from "../content/staff-alerts.json";
import { escapeHtml as escapeEmailHtml, sendEmail } from "../lib/email";
import { prisma } from "../lib/prisma";
import { sendPush } from "../lib/push";
import { escapeHtml, sendTelegram } from "../lib/telegram";
import { formatDateOnly } from "../lib/time";
import { describeItem } from "./order-service";

// Tells staff about new and auto-cancelled orders on every channel that is set up:
// push notifications, email (accounts with "new order emails" on) and Telegram.
// Messages never include the customer's name, phone or address.

const ADMIN_URL = () => (process.env.ADMIN_URL ?? "http://localhost:3000/admin/orders").replace(/\/$/, "");

function money(amount: number): string {
  return `${amount.toLocaleString("vi-VN")} ₫`;
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

type StaffEmail = { subject: string; heading: string; lines: string[] };

// One email to every active account that wants new-order emails.
async function emailStaff(email: StaffEmail): Promise<void> {
  const recipients = await prisma.adminUser.findMany({
    where: { isActive: true, notifyNewOrders: true },
    select: { email: true },
  });
  // Separate emails, so nobody sees the other accounts' addresses.
  await Promise.all(
    recipients.map(({ email: to }) => {
      const footer = fill(text.footer, { email: to });
      const html =
        `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#000">` +
        `<p style="font-size:18px;font-weight:bold">${escapeEmailHtml(email.heading)}</p>` +
        email.lines.map((line) => (line === "" ? "<br>" : `<div>${escapeEmailHtml(line)}</div>`)).join("") +
        `<p><a href="${escapeEmailHtml(ADMIN_URL())}" style="display:inline-block;background:#000;color:#fff;padding:12px 20px;text-decoration:none;font-weight:bold">${escapeEmailHtml(text.newOrder.button)}</a></p>` +
        `<p style="color:#777;font-size:12px">${escapeEmailHtml(footer)}</p></div>`;
      const plain = [email.heading, "", ...email.lines, "", ADMIN_URL(), "", footer].join("\n");
      return sendEmail({ to, subject: email.subject, text: plain, html });
    }),
  );
}

// Runs every channel; one failing channel never stops the others.
async function allChannels(tasks: (() => Promise<unknown>)[]): Promise<void> {
  const results = await Promise.allSettled(tasks.map((task) => task()));
  for (const result of results) {
    if (result.status === "rejected") console.error("Staff notification failed:", result.reason);
  }
}

export async function notifyNewOrder(code: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { code },
    include: { items: true, deliveryZone: true },
  });
  if (!order) return;

  const settings = await prisma.shopSetting.findUnique({ where: { id: 1 }, select: { unpaidCancelMinutes: true } });
  const day = formatDateOnly(order.deliveryDate).split("-").reverse().join("/");
  const when = order.deliveryType === "ASAP" ? `${text.asap} · ${day}` : `${day} · ${order.deliverySlot ?? ""}`;
  const values = { code: order.code, total: money(order.total), portions: order.totalPortions, when, zone: order.deliveryZone.nameVi };
  const itemLines = order.items.map((item) => `${item.quantity} × ${describeItem(item.nameSnapshot, item.optionsSnapshot, "vi")}`);
  const autoCancel =
    settings && settings.unpaidCancelMinutes > 0 ? fill(text.newOrder.autoCancel, { minutes: settings.unpaidCancelMinutes }) : null;

  const telegramLines = [
    `<b>${escapeHtml(fill(text.newOrder.heading, values))}</b>`,
    escapeHtml(fill(text.newOrder.totals, values)),
    escapeHtml(fill(text.newOrder.delivery, values)),
    "",
    ...itemLines.map((line) => `• ${escapeHtml(line)}`),
    "",
    escapeHtml(fill(text.newOrder.waiting, values)),
    ...(autoCancel ? [escapeHtml(autoCancel)] : []),
    escapeHtml(ADMIN_URL()),
  ];

  await allChannels([
    () =>
      sendPush({
        title: fill(text.newOrder.pushTitle, values),
        body: fill(text.newOrder.pushBody, values),
        url: "/admin/orders",
        tag: `order-${order.code}`,
      }),
    () =>
      emailStaff({
        subject: fill(text.newOrder.subject, values),
        heading: fill(text.newOrder.heading, values),
        lines: [
          fill(text.newOrder.totals, values),
          fill(text.newOrder.delivery, values),
          "",
          text.newOrder.itemsTitle,
          ...itemLines.map((line) => `• ${line}`),
          "",
          fill(text.newOrder.waiting, values),
          ...(autoCancel ? [autoCancel] : []),
        ],
      }),
    () => sendTelegram(telegramLines.join("\n")),
  ]);
}

// Tells staff which unpaid orders were just cancelled, so a late payment can be caught.
export async function notifyAutoCancelled(codes: string[]): Promise<void> {
  if (codes.length === 0) return;
  const values = { codes: codes.join(", ") };
  await allChannels([
    () =>
      sendPush({
        title: text.autoCancelled.pushTitle,
        body: fill(text.autoCancelled.pushBody, values),
        url: "/admin/orders",
        tag: "auto-cancelled",
      }),
    () =>
      emailStaff({
        subject: fill(text.autoCancelled.subject, values),
        heading: text.autoCancelled.heading,
        lines: [values.codes, "", text.autoCancelled.body],
      }),
    () =>
      sendTelegram(
        [`<b>${escapeHtml(text.autoCancelled.heading)}</b>`, escapeHtml(values.codes), "", escapeHtml(text.autoCancelled.body)].join("\n"),
      ),
  ]);
}
