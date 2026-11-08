// Sends email through Resend (https://resend.com). Needs RESEND_API_KEY and EMAIL_FROM in the
// backend .env. Without them nothing is sent and a warning is logged, so the rest of the site
// keeps working.

type Email = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(email: Email): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.warn("Email not sent: RESEND_API_KEY or EMAIL_FROM is missing.");
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // Log the status only: the response may repeat the address, which we keep out of logs.
      console.error(`Email not sent: Resend answered ${response.status}.`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Email not sent:", error instanceof Error ? error.message : error);
    return false;
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
