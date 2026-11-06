// Sends short messages to the shop's Telegram group (new orders, auto-cancelled orders).
//
// Privacy: messages never contain the customer's name, phone number or address.
// Staff open the admin page for those details.
//
// Setup (see .env.example): TELEGRAM_BOT_TOKEN from @BotFather, TELEGRAM_CHAT_ID of the group.
// Without them, nothing is sent and the shop works as before.

const SEND_TIMEOUT_MS = 8000;

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

// Makes text safe inside a Telegram HTML message.
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Returns true when Telegram accepted the message. Never throws: a failed notification
// must never break placing an order.
export async function sendTelegram(html: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      // The token is part of the URL, so only the status is logged, never the request.
      console.error(`Telegram message failed with status ${response.status}`);
      return false;
    }
    return true;
  } catch {
    console.error("Telegram message failed (network or timeout)");
    return false;
  }
}
