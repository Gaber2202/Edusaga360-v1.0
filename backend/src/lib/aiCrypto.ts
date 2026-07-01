/**
 * Symmetric encryption for tenant LLM API keys stored at rest.
 *
 * AES-256-GCM with a master key from the AI_CONFIG_ENC_KEY env var. The key must
 * be 32 bytes, provided as base64 or hex. Ciphertext is serialized as
 * base64(iv[12] | authTag[16] | ciphertext) in a single string column.
 *
 * Fail-closed: if the master key is missing or malformed, encrypt() throws so a
 * provider key is never written in plaintext, and decrypt() throws so we never
 * silently hand a bad key to a provider.
 */
import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getMasterKey(): Buffer {
  const raw = (process.env.AI_CONFIG_ENC_KEY || '').trim();
  if (!raw) {
    throw new Error('AI_CONFIG_ENC_KEY is not set — cannot encrypt/decrypt tenant provider keys');
  }
  // Accept base64 or hex; both must decode to exactly 32 bytes.
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }
  if (key.length !== 32) {
    throw new Error('AI_CONFIG_ENC_KEY must decode to 32 bytes (256-bit) as base64 or hex');
  }
  return key;
}

/** True when a usable master key is configured (used to gate admin writes). */
export function isAiCryptoConfigured(): boolean {
  try {
    getMasterKey();
    return true;
  } catch {
    return false;
  }
}

/** Encrypt a plaintext secret → base64(iv | tag | ciphertext). */
export function encryptSecret(plaintext: string): string {
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

/** Decrypt base64(iv | tag | ciphertext) → plaintext. Throws on tamper/bad key. */
export function decryptSecret(payload: string): string {
  const key = getMasterKey();
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error('ciphertext too short / malformed');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
