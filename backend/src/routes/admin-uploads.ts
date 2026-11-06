import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import sharp from "sharp";
import { requireAdmin } from "../lib/auth";
import { isStorageConfigured, putImage } from "../lib/storage";

export const adminUploadsRouter = Router();
adminUploadsRouter.use(requireAdmin);

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB, enough for a phone photo
// What can be uploaded: product photos and the wide homepage banner.
const KINDS = {
  product: { folder: "products", maxSide: 1600 }, // longest side after resizing, in pixels
  banner: { folder: "banners", maxSide: 2400 },
} as const;
type UploadKind = keyof typeof KINDS;

function isUploadKind(value: string): value is UploadKind {
  return Object.hasOwn(KINDS, value);
}
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

// Files stay in memory only (never written to the server's disk).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS" },
});

// Runs multer and turns its errors into clear answers instead of a generic 500.
function receiveSingleImage(req: Request, res: Response, next: NextFunction) {
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

// POST /api/admin/uploads/product  or  /api/admin/uploads/banner
// Multipart form with one file in the field "image". Returns { url }.
// The picture is only used after the admin presses Save on the product or homepage.
adminUploadsRouter.post("/:kind", uploadLimiter, receiveSingleImage, async (req, res) => {
  const kind = String(req.params.kind);
  if (!isUploadKind(kind)) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  const { folder, maxSide } = KINDS[kind];
  if (!isStorageConfigured()) {
    res.status(503).json({ error: "STORAGE_NOT_CONFIGURED" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "NO_FILE" });
    return;
  }

  // Check the real file content, not the name or the type the browser claims.
  let output: Buffer;
  try {
    // limitInputPixels protects the server from "decompression bomb" images.
    const image = sharp(req.file.buffer, { limitInputPixels: 50_000_000 });
    const metadata = await image.metadata();
    if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
      res.status(400).json({ error: "UNSUPPORTED_IMAGE" });
      return;
    }
    output = await image
      .rotate() // apply the phone's orientation before the metadata is removed
      .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer(); // sharp drops EXIF data (GPS location, camera details) unless told to keep it
  } catch {
    res.status(400).json({ error: "UNSUPPORTED_IMAGE" });
    return;
  }

  const url = await putImage(`${folder}/${randomUUID()}.webp`, output, "image/webp");
  console.log(`Image uploaded by admin ${req.admin!.email}: ${url}`);
  res.status(201).json({ url });
});
