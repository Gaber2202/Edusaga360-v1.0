/**
 * API key minting + verification for the external integration API.
 *
 * Key format:  esk_<env>_<48 hex chars>
 *   - "esk"  — EduSaga key, a stable, greppable marker.
 *   - <env>  — "live" in production, "test" elsewhere, so a key that leaks makes
 *              its blast radius obvious and test keys can't be mistaken for prod.
 *   - suffix — 24 random bytes (192 bits) of entropy.
 *
 * Only the SHA-256 hash and a non-secret PREFIX are ever stored (see the
 * 20260712_external_api_keys migration). The prefix is the first PREFIX_LEN
 * chars — long enough to include per-key entropy for a unique indexed lookup,
 * but far too short to reconstruct the secret. Verification is therefore:
 *   lookup by prefix → constant-time compare of SHA-256(candidate) to key_hash.
 */
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/** "live" in production, "test" everywhere else. */
export const KEY_ENV = process.env.NODE_ENV === 'production' ? 'live' : 'test';

/** Length of the non-secret lookup handle, e.g. "esk_live_a1b2c3d4". */
export const PREFIX_LEN = 16;

export interface GeneratedKey {
  /** Full secret — return to the caller ONCE, never persist. */
  plaintext: string;
  /** Non-secret lookup handle stored in api_keys.key_prefix. */
  prefix: string;
  /** SHA-256 of the full secret stored in api_keys.key_hash. */
  hash: string;
}

/** SHA-256 hex digest of a key's plaintext. */
export function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/** The non-secret prefix of a (candidate) plaintext key. */
export function prefixOf(plaintext: string): string {
  return plaintext.slice(0, PREFIX_LEN);
}

/** Mint a fresh key. The plaintext is unrecoverable once this return value is dropped. */
export function generateApiKey(): GeneratedKey {
  const secret = randomBytes(24).toString('hex');
  const plaintext = `esk_${KEY_ENV}_${secret}`;
  return { plaintext, prefix: prefixOf(plaintext), hash: hashKey(plaintext) };
}

/** Constant-time compare of a candidate key against a stored SHA-256 hash. */
export function verifyKey(plaintext: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashKey(plaintext), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  // timingSafeEqual throws on length mismatch; guard so a malformed stored hash
  // is a clean "false", not a 500.
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
