/**
 * SSRF guard — assertPublicUrl blocks non-http(s) schemes and loopback /
 * link-local / private / reserved hosts (IP literals checked synchronously).
 */
import { describe, it, expect } from 'vitest';
import { assertPublicUrl, isPrivateIp, SsrfError } from '../lib/ssrfGuard.js';

describe('isPrivateIp', () => {
  it('flags loopback / private / link-local / metadata ranges', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0']) {
      expect(isPrivateIp(ip)).toBe(true);
    }
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fd00::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
  });

  it('allows public addresses', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
    expect(isPrivateIp('172.32.0.1')).toBe(false); // just outside 172.16/12
  });
});

describe('assertPublicUrl', () => {
  it('rejects the cloud metadata endpoint', async () => {
    await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data/')).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects loopback and private IP literals', async () => {
    await expect(assertPublicUrl('http://127.0.0.1:8080/x')).rejects.toBeInstanceOf(SsrfError);
    await expect(assertPublicUrl('https://10.0.0.5/internal')).rejects.toBeInstanceOf(SsrfError);
    await expect(assertPublicUrl('http://[::1]/x')).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects non-http(s) schemes and malformed URLs', async () => {
    await expect(assertPublicUrl('ftp://example.com/x')).rejects.toBeInstanceOf(SsrfError);
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toBeInstanceOf(SsrfError);
    await expect(assertPublicUrl('not a url')).rejects.toBeInstanceOf(SsrfError);
  });

  it('allows a public IP literal', async () => {
    await expect(assertPublicUrl('https://8.8.8.8/')).resolves.toBeUndefined();
  });
});
