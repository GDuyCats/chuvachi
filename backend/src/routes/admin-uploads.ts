import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAdminRole, requireStaff } from "../lib/auth";
import { ImageError, receiveSingleImage, storeImage } from "../lib/image-upload";
import { isStorageConfigured } from "../lib/storage";
import { rateLimitKey } from "../lib/client-ip";

export const adminUploadsRouter = Router();
adminUploadsRouter.use(requireStaff, requireAdminRole);

// What can be uploaded: product photos and the wide homepage banner.
const KINDS = {
  product: { folder: "products", maxSide: 1600 }, // longest side after resizing, in pixels
  banner: { folder: "banners", maxSide: 2400 },
} as const;
type UploadKind = keyof typeof KINDS;

function isUploadKind(value: string): value is UploadKind {
  return Object.hasOwn(KINDS, value);
}

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: rateLimitKey, // real visitor IP behind Cloudflare
  message: { error: "TOO_MANY_REQUESTS" },
});

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

  let url: string;
  try {
    url = await storeImage(req.file.buffer, folder, maxSide);
  } catch (error) {
    if (error instanceof ImageError) {
      res.status(400).json({ error: "UNSUPPORTED_IMAGE" });
      return;
    }
    throw error;
  }
  console.log(`Image uploaded by admin ${req.admin!.email}: ${url}`);
  res.status(201).json({ url });
});
