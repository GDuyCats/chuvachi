import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import { putImage } from "./storage";

// Shared image upload handling: one picture per request, checked and converted to WebP.
// Used for product photos (admin) and for customers' review and comment photos.

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB, enough for a phone photo
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

// Files stay in memory only (never written to the server's disk).
// A few small text fields are allowed next to the file (e.g. order code and phone).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5, fieldSize: 200 },
});

// Runs multer and turns its errors into clear answers instead of a generic 500.
export function receiveSingleImage(req: Request, res: Response, next: NextFunction) {
  upload.single("image")(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === "LIMIT_FILE_SIZE";
      res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? "FILE_TOO_LARGE" : "BAD_UPLOAD" });
      return;
    }
    next(error);
  });
}

export class ImageError extends Error {}

// Checks the real file content (not the name or the type the browser claims), turns the photo
// upright, shrinks it and converts it to WebP. EXIF data (GPS location, camera details) is dropped.
export async function toWebp(input: Buffer, maxSide: number): Promise<Buffer> {
  try {
    // limitInputPixels protects the server from "decompression bomb" images.
    const image = sharp(input, { limitInputPixels: 50_000_000 });
    const metadata = await image.metadata();
    if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) throw new ImageError("UNSUPPORTED_IMAGE");
    return await image
      .rotate() // apply the phone's orientation before the metadata is removed
      .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new ImageError("UNSUPPORTED_IMAGE");
  }
}

// Converts and stores one picture in the given folder; returns its public URL.
export async function storeImage(input: Buffer, folder: string, maxSide: number): Promise<string> {
  const output = await toWebp(input, maxSide);
  return putImage(`${folder}/${randomUUID()}.webp`, output, "image/webp");
}
