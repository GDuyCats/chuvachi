import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Image storage on Cloudflare R2 (it speaks the same language as Amazon S3).
// All values come from the .env file; see .env.example.

type StorageConfig = {
  client: S3Client;
  bucket: string;
  publicBaseUrl: string; // e.g. https://pub-xxxx.r2.dev, later https://img.your-domain.com
};

let cached: StorageConfig | null | undefined;

function getConfig(): StorageConfig | null {
  if (cached !== undefined) return cached;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBaseUrl = process.env.R2_PUBLIC_URL?.replace(/\/+$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    cached = null;
    return cached;
  }
  cached = {
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
    publicBaseUrl,
  };
  return cached;
}

export function isStorageConfigured(): boolean {
  return getConfig() !== null;
}

// True only for files that live in our own bucket. Product images must be one of these,
// so nobody can make the shop load pictures from a site we don't control.
export function isOwnImageUrl(url: string): boolean {
  const config = getConfig();
  return config !== null && url.startsWith(`${config.publicBaseUrl}/`) && !url.includes("..");
}

// True for a file of ours inside one folder, e.g. customers' review photos ("reviews").
export function isOwnImageInFolder(url: string, folder: string): boolean {
  const config = getConfig();
  return config !== null && isOwnImageUrl(url) && url.startsWith(`${config.publicBaseUrl}/${folder}/`);
}

// Uploads a finished image and returns its public URL.
export async function putImage(key: string, body: Buffer, contentType: string): Promise<string> {
  const config = getConfig();
  if (!config) throw new Error("Image storage is not configured");
  await config.client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // File names are random and never reused, so browsers may keep them for a year.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return `${config.publicBaseUrl}/${key}`;
}

// Removes an image we no longer use. Failures are only logged: a leftover file costs
// almost nothing, and it must never block saving a product.
export async function deleteImageByUrl(url: string): Promise<void> {
  const config = getConfig();
  if (!config || !isOwnImageUrl(url)) return;
  const key = url.slice(config.publicBaseUrl.length + 1);
  try {
    await config.client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
  } catch (error) {
    console.error(`Could not delete old image ${key}:`, error);
  }
}
