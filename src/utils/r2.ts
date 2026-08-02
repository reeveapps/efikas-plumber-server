import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

const R2_SCHEME = 'r2://';
const PRESIGN_EXPIRY_SECONDS = 3600;

function getClient(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.CF_ACCESS_KEY_ID,
      secretAccessKey: env.CF_SECRET_ACCESS_KEY,
    },
  });
}

function assertConfigured(): void {
  if (!env.CF_ACCOUNT_ID || !env.CF_ACCESS_KEY_ID || !env.CF_SECRET_ACCESS_KEY || !env.R2_BUCKET_NAME) {
    throw new Error('Cloudflare R2 is not configured (CF_ACCOUNT_ID/CF_ACCESS_KEY_ID/CF_SECRET_ACCESS_KEY/R2_BUCKET_NAME)');
  }
}

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

// Stores the object under `folder/` and returns a stable, self-identifying
// `r2://<key>` reference — NOT a fetchable URL. The bucket is private (R2's
// default; no public dev domain or custom domain is bound), so nothing can
// load `r2://...` directly — every response is walked by `sendSuccess`
// (see utils/response.ts), which turns each `r2://` reference into a
// short-lived presigned GET URL right before the JSON is sent. This means
// the "URL" persisted in the DB never expires or depends on bucket
// visibility; only the presigned link handed to a given client does.
export async function uploadToR2(file: UploadedFile, folder: string): Promise<string> {
  assertConfigured();

  const ext = file.originalname.includes('.') ? file.originalname.split('.').pop() : undefined;
  const key = `${folder}/${randomUUID()}${ext ? `.${ext}` : ''}`;

  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );

  return `${R2_SCHEME}${key}`;
}

/// Recognizes both the current `r2://key` format and the broken
/// `/folder/key` strings written before this fix existed (when
/// `R2_PUBLIC_URL` was unset, `uploadToR2` returned a bare `/${key}` with no
/// host — invalid as a URL, but the key itself is still recoverable from it).
export function extractR2Key(stored: string): string | null {
  if (stored.startsWith(R2_SCHEME)) return stored.slice(R2_SCHEME.length);
  if (/^\/(bookings|products|kyc)\//.test(stored)) return stored.slice(1);
  return null;
}

export async function presignR2Url(stored: string, expiresInSeconds = PRESIGN_EXPIRY_SECONDS): Promise<string> {
  const key = extractR2Key(stored);
  if (!key) return stored;
  assertConfigured();
  const client = getClient();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

/// Recursively walks an API response payload and replaces every `r2://` (or
/// legacy broken `/folder/key`) string with a freshly presigned URL, leaving
/// everything else untouched. Called from `sendSuccess` so this happens for
/// every endpoint automatically — no controller needs to know its response
/// contains file references. Presigning itself is a local HMAC computation
/// (no network round-trip), so walking even a large nested payload is cheap.
export async function presignResponseUrls<T>(data: T): Promise<T> {
  if (typeof data === 'string') {
    return (extractR2Key(data) ? await presignR2Url(data) : data) as unknown as T;
  }
  if (Array.isArray(data)) {
    return (await Promise.all(data.map((item) => presignResponseUrls(item)))) as unknown as T;
  }
  if (data instanceof Date || data === null || typeof data !== 'object') {
    return data;
  }
  const entries = await Promise.all(
    Object.entries(data as Record<string, unknown>).map(async ([k, v]) => [k, await presignResponseUrls(v)] as const)
  );
  return Object.fromEntries(entries) as T;
}

export async function deleteFromR2(stored: string): Promise<void> {
  const key = extractR2Key(stored);
  if (!key) return;
  assertConfigured();
  const client = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }));
}
