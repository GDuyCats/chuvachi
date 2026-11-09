// Orders placed or looked up on this device, so a guest can open them again (from the
// "My orders" page or a notification) without typing the code and phone number each time.
// Kept only in this browser; nothing here is sent anywhere except to look up that same order.

export type DeviceOrder = { code: string; phone: string; savedAt: string };

const STORAGE_KEY = "chuvachi-my-orders";
const KEEP = 20; // newest orders kept
const KEEP_DAYS = 90;

function read(): DeviceOrder[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
    return parsed.filter(
      (o): o is DeviceOrder =>
        typeof o === "object" &&
        o !== null &&
        typeof (o as DeviceOrder).code === "string" &&
        typeof (o as DeviceOrder).phone === "string" &&
        typeof (o as DeviceOrder).savedAt === "string" &&
        new Date((o as DeviceOrder).savedAt).getTime() > cutoff,
    );
  } catch {
    return [];
  }
}

export function deviceOrders(): DeviceOrder[] {
  return read();
}

export function findDeviceOrder(code: string): DeviceOrder | null {
  const wanted = code.trim().toUpperCase();
  return read().find((o) => o.code === wanted) ?? null;
}

// Remembers (or refreshes) an order on this device.
export function rememberOrder(code: string, phone: string): void {
  const clean = code.trim().toUpperCase();
  if (!clean || !phone.trim()) return;
  try {
    const others = read().filter((o) => o.code !== clean);
    const next = [{ code: clean, phone: phone.trim(), savedAt: new Date().toISOString() }, ...others].slice(0, KEEP);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be blocked (private mode); the order just isn't remembered.
  }
}

export function forgetOrder(code: string): void {
  try {
    const next = read().filter((o) => o.code !== code.trim().toUpperCase());
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}
