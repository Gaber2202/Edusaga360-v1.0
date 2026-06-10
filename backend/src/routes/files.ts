/**
 * File upload endpoint — /api/files/upload
 *
 * Security guarantees:
 *  - JWT auth required; tenant_id must be present in app_metadata
 *  - Magic-byte validation (not just Content-Type header)
 *  - 10 MB hard size limit enforced during streaming — rejects at 413 before full read
 *  - Original filename is discarded — UUID-based path prevents path traversal
 *  - Uploads to a private Supabase Storage bucket using the service-role key
 *  - Returns a 1-hour signed URL so the client can access the file without exposing the bucket
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

// ── Allowed types: magic bytes + permitted extensions ─────────────────────────
interface AllowedType {
  ext: string;
  /** Returns true when the supplied buffer matches this type's magic bytes. */
  matches: (buf: Buffer) => boolean;
}

const ALLOWED_TYPES: AllowedType[] = [
  {
    ext: 'pdf',
    // %PDF  →  25 50 44 46
    matches: (b) => b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  },
  {
    ext: 'jpg',
    // FF D8 FF
    matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: 'png',
    // 89 50 4E 47 0D 0A 1A 0A
    matches: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    ext: 'docx',
    // PK ZIP header (50 4B 03 04) — covers both DOCX and XLSX
    // We'll distinguish DOCX vs XLSX by the declared Content-Type after magic validation.
    matches: (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  },
  {
    ext: 'xlsx',
    // Same ZIP magic — handled identically to DOCX at byte level
    matches: (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  },
];

/**
 * Determine the extension from magic bytes.
 * Returns null if the file does not match any allowed type.
 * For ZIP-based formats (DOCX/XLSX), falls back to the declared Content-Type
 * to distinguish between them; defaults to 'docx' when ambiguous.
 */
function detectExtension(buf: Buffer, declaredMime: string | undefined): string | null {
  // Check non-ZIP types first (PDF, JPG, PNG)
  for (const type of ALLOWED_TYPES) {
    if (type.ext === 'docx' || type.ext === 'xlsx') continue;
    if (type.matches(buf)) return type.ext;
  }

  // ZIP-based: DOCX or XLSX
  const zipType = ALLOWED_TYPES.find((t) => t.ext === 'docx');
  if (zipType && zipType.matches(buf)) {
    const mime = (declaredMime ?? '').toLowerCase();
    if (
      mime.includes('spreadsheet') ||
      mime.includes('xlsx') ||
      mime.includes('excel')
    ) {
      return 'xlsx';
    }
    // Default to docx for all other ZIP-based office formats
    return 'docx';
  }

  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Read the raw multipart body, enforce size limit, and return:
 *  { fileBuffer, declaredMime }
 *
 * Parses a single `multipart/form-data` upload WITHOUT external dependencies,
 * using only Node's built-in stream APIs.
 *
 * The parser is intentionally minimal — it only extracts the first file part.
 */
async function readMultipart(
  req: AuthenticatedRequest,
): Promise<{ fileBuffer: Buffer; declaredMime: string | undefined }> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] ?? '';
    const boundaryMatch = contentType.match(/boundary=([^\s;]+)/i);
    if (!boundaryMatch) {
      return reject({ status: 400, message: 'Missing multipart boundary' });
    }

    const boundary = Buffer.from('--' + boundaryMatch[1]);
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let aborted = false;

    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BYTES) {
        aborted = true;
        req.destroy();
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

      // Find start of first file part's headers
      const partStart = indexOf(body, boundary, 0);
      if (partStart === -1) {
        return reject({ status: 400, message: 'Malformed multipart body' });
      }

      // Find the blank line (\r\n\r\n) that separates headers from file data
      const CRLF2 = Buffer.from('\r\n\r\n');
      const headersEnd = indexOf(body, CRLF2, partStart);
      if (headersEnd === -1) {
        return reject({ status: 400, message: 'Malformed multipart headers' });
      }

      const headersRaw = body.slice(partStart + boundary.length, headersEnd).toString('utf8');

      // Extract declared Content-Type from part headers
      const ctMatch = headersRaw.match(/content-type:\s*([^\r\n]+)/i);
      const declaredMime = ctMatch ? ctMatch[1].trim() : undefined;

      // File data starts right after the blank line
      const fileStart = headersEnd + CRLF2.length;

      // Find the closing boundary (\r\n--boundary)
      const closingBoundary = Buffer.from('\r\n--' + boundaryMatch[1]);
      const fileEnd = indexOf(body, closingBoundary, fileStart);
      if (fileEnd === -1) {
        return reject({ status: 400, message: 'Malformed multipart: missing closing boundary' });
      }

      const fileBuffer = body.slice(fileStart, fileEnd);
      if (fileBuffer.length === 0) {
        return reject({ status: 400, message: 'No file data found in request' });
      }

      resolve({ fileBuffer, declaredMime });
    });
  });
}

/** Buffer.indexOf equivalent that works across Node versions. */
function indexOf(haystack: Buffer, needle: Buffer, offset: number): number {
  for (let i = offset; i <= haystack.length - needle.length; i++) {
    let found = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        found = false;
        break;
      }
    }
    if (found) return i;
  }
  return -1;
}

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * POST /upload
 *
 * Expects a multipart/form-data request with a single file field named `file`.
 * Returns:
 *   200  { path: string; signedUrl: string }
 *   400  validation / parse error
 *   401  unauthenticated or missing tenant_id
 *   413  file too large
 *   415  unsupported file type
 */
filesRouter.post('/upload', async (req: AuthenticatedRequest, res: Response) => {
  // ── 1. Auth check ────────────────────────────────────────────────────────────
  const user = req.user;
  if (!user) {
    return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  if (!user.tenant_id) {
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
  const ext = detectExtension(fileBuffer, declaredMime);
  if (!ext) {
    return res.status(415).json({
      success: false,
      error: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'File type not allowed. Permitted types: PDF, JPG, PNG, DOCX, XLSX',
    });
  }

  // ── 5. Build storage path ────────────────────────────────────────────────────
  const year = new Date().getFullYear().toString();
  const uuid = randomUUID();
  const storagePath = `${user.tenant_id}/${year}/${uuid}.${ext}`;

  // ── 6. Upload to Supabase Storage ─────────────────────────────────────────────
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: declaredMime ?? 'application/octet-stream',
      upsert: false,
    });

  if (uploadError) {
    console.error('[files/upload] Supabase upload error:', uploadError.message);
    return res.status(500).json({ success: false, error: 'UPLOAD_FAILED', message: 'Failed to store file' });
  }

  // ── 7. Generate 1-hour signed URL ─────────────────────────────────────────────
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
