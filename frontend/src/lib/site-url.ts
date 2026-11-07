// The public address of the shop, used for links in search engines and link previews.
// Set NEXT_PUBLIC_SITE_URL=https://chuvachi.com on the real server.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
