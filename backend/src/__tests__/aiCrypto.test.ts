/**
 * Tenant provider key encryption — AES-256-GCM round-trip, fail-closed, tamper.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

const KEY_B64 = crypto.randomBytes(32).toString('base64');

async function freshModule() {
  // Re-import so getMasterKey re-reads the current env.
  return await import('../lib/aiCrypto.js');
}

beforeEach(() => { process.env.AI_CONFIG_ENC_KEY = KEY_B64; });
afterEach(() => { delete process.env.AI_CONFIG_ENC_KEY; });

describe('aiCrypto', () => {
  it('encrypts and decrypts a secret (round-trip)', async () => {
    const { encryptSecret, decryptSecret } = await freshModule();
    const secret = 'sk-proj-abcdef1234567890';
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret);          // ciphertext must not leak the key
    expect(decryptSecret(enc)).toBe(secret);
  });

  it('produces a different ciphertext each time (random IV)', async () => {
    const { encryptSecret, decryptSecret } = await freshModule();
    const a = encryptSecret('same-value');
    const b = encryptSecret('same-value');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('same-value');
    expect(decryptSecret(b)).toBe('same-value');
  });

  it('reports configured/unconfigured correctly', async () => {
    const { isAiCryptoConfigured } = await freshModule();
    expect(isAiCryptoConfigured()).toBe(true);
    delete process.env.AI_CONFIG_ENC_KEY;
    expect(isAiCryptoConfigured()).toBe(false);
  });

  it('fails closed when the master key is missing', async () => {
    const { encryptSecret } = await freshModule();
    delete process.env.AI_CONFIG_ENC_KEY;
    expect(() => encryptSecret('x')).toThrow(/AI_CONFIG_ENC_KEY/);
  });

  it('rejects a master key that is not 32 bytes', async () => {
    const { encryptSecret } = await freshModule();
    process.env.AI_CONFIG_ENC_KEY = Buffer.from('too-short').toString('base64');
    expect(() => encryptSecret('x')).toThrow(/32 bytes/);
  });

  it('detects tampering via the GCM auth tag', async () => {
    const { encryptSecret, decryptSecret } = await freshModule();
    const enc = encryptSecret('secret');
    const buf = Buffer.from(enc, 'base64');
    buf[buf.length - 1] ^= 0xff; // flip a ciphertext byte
    expect(() => decryptSecret(buf.toString('base64'))).toThrow();
  });
});
