// Normalizes a Vietnamese phone number: removes spaces, dots and dashes, and turns +84 into 0.
// Example: "+84 912.345.678" -> "0912345678"
export function normalizePhone(value: string): string {
  const digits = value.replace(/[\s.-]/g, "");
  return digits.startsWith("+84") ? `0${digits.slice(3)}` : digits;
}

// A valid normalized Vietnamese mobile number: 0 followed by 9 digits.
export const PHONE_PATTERN = /^0\d{9}$/;
