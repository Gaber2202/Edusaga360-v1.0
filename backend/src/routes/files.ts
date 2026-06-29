/**
 * File upload endpoint — /api/files
 *
 * Security guarantees:
 *  - JWT auth required; user must be tenant-scoped OR a platform owner
 *  - Magic-byte validation (not just the Content-Type header)
 *  - 10 MB hard size limit enforced during streaming — rejects at 413 before full read
 *  - Original filename is discarded — UUID-based path prevents path traversal
 *  - Uploads to a private Supabase Storage bucket using the service-role key
 *  - Returns a signed URL so the client can access the file without exposing the bucket
 *  - GET /sign re-mints a signed URL from a stored path (signed URLs expire, paths don't)
 */

import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../middleware/auth.js';

export const filesRouter = Router();

// ── Supabase client (service-role — required for private bucket writes) ──────
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Constants ─────────────────────────────────────────────────────────────────
const BUCKET = 'tenant-files';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const SIGNED_URL_TTL = 60 * 60;     // 1 hour in seconds

/**
 * The folder a user's files live under. Tenant users are scoped to their
 * tenant_id; platform owners (who have no tenant) get a shared `platform/`
 * namespace so they can upload too (previously they were rejected with 401).
 */
function storageScope(user: NonNullable<AuthenticatedRequest['user']>): string | null {
  if (user.tenant_id) return user.tenant_id;
  if (user.is_platform_owner) return 'platform';
  return null;
}

// ── Allowed types: magic bytes + permitted extensions ─────────────────────────
interface AllowedType {
  ext: string;
  /** Default content-type to store when the client didn't send a usable one. */
  mime: string;
  /** Returns true when the supplied buffer matches this type's magic bytes. */
  matches: (buf: Buffer) => boolean;
}

const ascii = (s: string) => Buffer.from(s, 'ascii');

const ALLOWED_TYPES: AllowedType[] = [
  {
    ext: 'pdf',
    mime: 'application/pdf',
    // %PDF  →  25 50 44 46
    matches: (b) => b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  },
  {
    ext: 'jpg',
    mime: 'image/jpeg',
    // FF D8 FF
    matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: 'png',
    mime: 'image/png',
    // 89 50 4E 47 0D 0A 1A 0A
    matches: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    ext: 'gif',
    mime: 'image/gif',
    // GIF87a / GIF89a  →  47 49 46 38
    matches: (b) => b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  },
  {
    ext: 'webp',
    mime: 'image/webp',
    // RIFF....WEBP
    matches: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).equals(ascii('RIFF')) &&
      b.subarray(8, 12).equals(ascii('WEBP')),
  },
  {
    ext: 'heic',
    mime: 'image/heic',
    // ISO-BMFF: bytes 4..8 == 'ftyp', brand at 8..12 is a HEIF/HEIC brand.
    // Covers the default iPhone photo format.
    matches: (b) => {
      if (b.length < 12 || !b.subarray(4, 8).equals(ascii('ftyp'))) return false;
      const brand = b.subarray(8, 12).toString('ascii');
      return ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevm', 'hevs', 'mif1', 'msf1', 'heif'].includes(brand);
    },
  },
  {
    ext: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    // PK ZIP header (50 4B 03 04) — covers DOCX/XLSX; disambiguated by declared mime
    matches: (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  },
];

/** Heuristic: looks like a plain-text file (CSV/TXT) — no NUL bytes in the sample. */
function looksLikeText(buf: Buffer): boolean {
  const sample = buf.subarray(0, 1024);
  if (sample.length === 0) return false;
  for (const byte of sample) {
    // Reject NUL and most control chars except tab/newline/carriage-return/form-feed.
    if (byte === 0) return false;
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) return false;
  }
  return true;
}

const TEXT_MIME_HINTS = ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'];

/**
 * Determine { ext, mime } from magic bytes (and declared mime as a tie-breaker).
 * Returns null if the file does not match any allowed type.
 */
function detectType(buf: Buffer, declaredMime: string | undefined): { ext: string; mime: string } | null {
  const mime = (declaredMime ?? '').toLowerCase();

  for (const type of ALLOWED_TYPES) {
    if (!type.matches(buf)) continue;

    // ZIP-based office formats: DOCX vs XLSX decided by declared mime.
    if (type.ext === 'docx') {
      if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('xlsx')) {
        return { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
      }
      return { ext: 'docx', mime: type.mime };
    }
    return { ext: type.ext, mime: type.mime };
  }

  // No binary signature matched — allow CSV/TXT when the client says it's text
  // and the bytes actually look like text. (CSV has no magic number.)
  if (TEXT_MIME_HINTS.some((h) => mime.includes(h)) && looksLikeText(buf)) {
    const isCsv = mime.includes('csv') || mime.includes('excel');
    return isCsv
      ? { ext: 'csv', mime: 'text/csv' }
      : { ext: 'txt', mime: 'text/plain' };
  }

  return null;
}

// ── Multipart parsing ───────────────────────────────────────────────────────

/**
 * Read the raw multipart body, enforce the size limit, and return the first
 * file part. Parses a single `multipart/form-data` upload using only Node's
 * built-in stream APIs (no external dependency).
 */
async function readMultipart(
  req: AuthenticatedRequest,
): Promise<{ fileBuffer: Buffer; declaredMime: string | undefined }> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] ?? '';
    const boundaryMatch = contentType.match(/boundary=("?)([^";]+)\1/i);
    if (!boundaryMatch) {
      return reject({ status: 400, message: 'Missing multipart boundary' });
    }
    const boundaryValue = boundaryMatch[2].trim();

    const boundary = Buffer.from('--' + boundaryValue);
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let aborted = false;

    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BYTES) {
        // Stop buffering and free what we have, but don't destroy the socket —
        // tearing it down here races the 413 response and the client just sees a
        // dropped connection. Reject so the route can send a clean 413; further
        // inbound data is ignored via the `aborted` guard.
        aborted = true;
        chunks.length = 0;
        return reject({ status: 413, message: 'File exceeds the 10 MB size limit' });
      }
      chunks.push(chunk);
    });

    req.on('error', (err) => {
      if (!aborted) reject({ status: 400, message: err.message });
    });

    req.on('end', () => {
      if (aborted) return;

      const body = Buffer.concat(chunks);

      // Start of the first part.
      const partStart = body.indexOf(boundary);
      if (partStart === -1) {
        return reject({ status: 400, message: 'Malformed multipart body' });
      }

      // Blank line separating part headers from part data.
      const CRLF2 = Buffer.from('\r\n\r\n');
      const headersEnd = body.indexOf(CRLF2, partStart);
      if (headersEnd === -1) {
        return reject({ status: 400, message: 'Malformed multipart headers' });
      }

      const headersRaw = body.subarray(partStart + boundary.length, headersEnd).toString('utf8');
      const ctMatch = headersRaw.match(/content-type:\s*([^\r\n]+)/i);
      const declaredMime = ctMatch ? ctMatch[1].trim() : undefined;

      // File data is between the header blank line and the closing boundary.
      const fileStart = headersEnd + CRLF2.length;
      const closingBoundary = Buffer.from('\r\n--' + boundaryValue);
      const fileEnd = body.indexOf(closingBoundary, fileStart);
      if (fileEnd === -1) {
        return reject({ status: 400, message: 'Malformed multipart: missing closing boundary' });
      }

      const fileBuffer = body.subarray(fileStart, fileEnd);
      if (fileBuffer.length === 0) {
        return reject({ status: 400, message: 'No file data found in request' });
      }

      resolve({ fileBuffer, declaredMime });
    });
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /upload
 *
 * Expects a multipart/form-data request with a single file field named `file`.
 * Returns:
 *   200  { success, path, signedUrl }
 *   400  validation / parse error
 *   401  unauthenticated / no upload scope
 *   413  file too large
 *   415  unsupported file type
 *   500  storage failure
 */
filesRouter.post('/upload', async (req: AuthenticatedRequest, res: Response) => {
  // ── 1. Auth + scope ──────────────────────────────────────────────────────────
  const user = req.user;
  if (!user) {
    return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  const scope = storageScope(user);
  if (!scope) {
    return res.status(401).json({ success: false, error: 'NO_TENANT', message: 'User is not associated with a tenant' });
  }

  // ── 2. Content-Type guard ────────────────────────────────────────────────────
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: 'Request must be multipart/form-data',
    });
  }

  // ── 3. Parse + size enforcement ──────────────────────────────────────────────
  let fileBuffer: Buffer;
  let declaredMime: string | undefined;

  try {
    ({ fileBuffer, declaredMime } = await readMultipart(req));
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    const status = e.status ?? 400;
    if (status === 413) {
      return res.status(413).json({ success: false, error: 'FILE_TOO_LARGE', message: e.message });
    }
    return res.status(400).json({ success: false, error: 'BAD_REQUEST', message: e.message ?? 'Failed to parse upload' });
  }

  // ── 4. Magic-byte type validation ────────────────────────────────────────────
  const detected = detectType(fileBuffer, declaredMime);
  if (!detected) {
    return res.status(415).json({
      success: false,
      error: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'File type not allowed. Permitted: PDF, JPG, PNG, GIF, WEBP, HEIC, DOCX, XLSX, CSV',
    });
  }

  // ── 5. Build storage path (UUID — original filename is never trusted) ─────────
  const year = new Date().getFullYear().toString();
  const storagePath = `${scope}/${year}/${randomUUID()}.${detected.ext}`;

  // ── 6. Upload to Supabase Storage ─────────────────────────────────────────────
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: detected.mime,
      upsert: false,
    });

  if (uploadError) {
    // Surface the real cause — a missing bucket and a permissions error are very
    // different to debug, and the previous generic message hid both.
    console.error('[files/upload] Supabase upload error:', uploadError.message);
    const msg = /bucket not found/i.test(uploadError.message)
      ? `Storage bucket "${BUCKET}" does not exist. Create it (private) in Supabase Storage.`
      : 'Failed to store file';
    return res.status(500).json({ success: false, error: 'UPLOAD_FAILED', message: msg });
  }

  // ── 7. Generate signed URL ────────────────────────────────────────────────────
  const { data: signedData, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);

  if (signedError || !signedData?.signedUrl) {
    console.error('[files/upload] Signed URL error:', signedError?.message);
    return res.status(500).json({ success: false, error: 'SIGNED_URL_FAILED', message: 'File stored but could not generate access URL' });
  }

  return res.status(200).json({
    success: true,
    path: storagePath,
    signedUrl: signedData.signedUrl,
  });
});

/**
 * GET /sign?path=<storagePath>
 *
 * Re-mint a signed URL for a previously uploaded file. Signed URLs expire after
 * an hour, so the client stores the permanent `path` and calls this to view the
 * file. Tenant users may only sign files under their own tenant folder; platform
 * owners may sign any path.
 */
filesRouter.get('/sign', async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  const path = typeof req.query.path === 'string' ? req.query.path : '';
  if (!path) {
    return res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Missing path query parameter' });
  }

  // Ownership check — tenant users are confined to their own folder.
  if (!user.is_platform_owner) {
    if (!user.tenant_id || !path.startsWith(`${user.tenant_id}/`)) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Not allowed to access this file' });
    }
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);

  if (error || !data?.signedUrl) {
    return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'File not found or inaccessible' });
  }

  return res.status(200).json({ success: true, signedUrl: data.signedUrl });
});
