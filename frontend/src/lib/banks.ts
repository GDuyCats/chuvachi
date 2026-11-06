// Common Vietnamese banks and their VietQR codes (BIN). Used to build the payment QR code.
export const BANKS: { bin: string; name: string }[] = [
  { bin: "970436", name: "Vietcombank" },
  { bin: "970407", name: "Techcombank" },
  { bin: "970422", name: "MB Bank" },
  { bin: "970416", name: "ACB" },
  { bin: "970415", name: "VietinBank" },
  { bin: "970418", name: "BIDV" },
  { bin: "970405", name: "Agribank" },
  { bin: "970432", name: "VPBank" },
  { bin: "970423", name: "TPBank" },
  { bin: "970403", name: "Sacombank" },
  { bin: "970441", name: "VIB" },
  { bin: "970437", name: "HDBank" },
  { bin: "970448", name: "OCB" },
  { bin: "970426", name: "MSB" },
  { bin: "970443", name: "SHB" },
];

// Image of a VietQR code with the amount and transfer message filled in.
// Customers scan it with their banking app, so nothing needs to be typed by hand.
export function vietQrImageUrl(options: {
  bin: string;
  accountNumber: string;
  accountName?: string | null;
  amount?: number;
  message?: string;
}): string {
  const query = new URLSearchParams();
  if (options.amount) query.set("amount", String(options.amount));
  if (options.message) query.set("addInfo", options.message);
  if (options.accountName) query.set("accountName", options.accountName);
  const path = `${encodeURIComponent(options.bin)}-${encodeURIComponent(options.accountNumber)}-compact2.png`;
  return `https://img.vietqr.io/image/${path}?${query.toString()}`;
}
