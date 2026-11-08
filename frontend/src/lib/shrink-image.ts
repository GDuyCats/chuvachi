// Makes a phone photo smaller in the browser before uploading it: faster on mobile data and
// always under the server's 8 MB limit. The server still checks and converts every picture.

const MAX_SIDE = 2000; // pixels
const QUALITY = 0.88;

export async function shrinkImage(file: File): Promise<File> {
  // Small files and anything the browser can't draw are sent as they are.
  if (file.size < 600 * 1024 || typeof createImageBitmap !== "function") return file;
  try {
    // "from-image" turns the photo upright the way the phone took it.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.fillStyle = "#ffffff"; // transparent PNG areas become white instead of black
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
