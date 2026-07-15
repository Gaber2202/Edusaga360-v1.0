/**
 * SSRF guard for admin-configurable outbound URLs.
 *
 * Several integration connectors let an admin/it_admin configure the URL the
 * backend will POST to (messaging custom `send_url` + Infobip `base_url`, email
 * custom `send_url`/`messages_url`, ATS custom `base_url` + Workday/LinkedIn/
 * Indeed URLs). Without a guard, a compromised admin could point those at
 * internal infrastructure — cloud metadata (169.254.169.254), localhost, or
 * private services — and use the server as a proxy (SSRF).
 *
 * `assertPublicUrl` rejects non-http(s) schemes and any host that is, or
 * resolves to, a loopback / link-local / private / reserved address.
 *
 * Design notes:
 *  - IP-literal hosts are checked synchronously, so the primary vectors (the
 *    metadata IP, 127.0.0.1, ::1) are always blocked regardless of DNS.
 *  - Hostnames are resolved and every returned address is checked. Resolution is
 *    time-boxed and FAILS OPEN (allows) on error/timeout, so offline/test
 *    environments and transient DNS blips don't block legitimate sends. This is a
 *    deliberate trade-off: the high-value literal vectors are always caught; a
 *    hostname that only resolves to a private IP at fetch time (and not at check
 *    time) is the residual gap.
 */
import net from 'net';
import { promises as dnsPromises } from 'dns';

export class SsrfError extends Error {}

function ipv4IsPrivate(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;        // this-host, private, loopback
  if (a === 169 && b === 254) return true;                  // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;         // private
  if (a === 192 && b === 168) return true;                  // private
  if (a === 100 && b >= 64 && b <= 127) return true;        // CGNAT (100.64/10)
  return false;
}

function ipv6IsPrivate(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === '::1' || s === '::') return true;               // loopback / unspecified
  if (s.startsWith('fc') || s.startsWith('fd')) return true; // unique-local fc00::/7
  if (/^fe[89ab]/.test(s)) return true;                     // link-local fe80::/10
  const mapped = s.match(/(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return ipv4IsPrivate(mapped[1]);
  return false;
}

/** True for any loopback / link-local / private / reserved (or malformed) IP. */
export function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return ipv4IsPrivate(ip);
  if (family === 6) return ipv6IsPrivate(ip);
  return true; // not a valid IP literal — treat as unsafe when checked as one
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SsrfError('dns timeout')), ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(timer)), timeout]);
}

/**
 * Throw SsrfError if `rawUrl` is not a safe public http(s) target.
 * Call before any fetch to an admin-configured URL.
 */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError('Invalid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfError('URL must use http or https');
  }

  const host = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  if (net.isIP(host) !== 0) {
    if (isPrivateIp(host)) throw new SsrfError('URL host is a private or reserved address');
    return;
  }

  // Hostname: resolve and check every address; fail open on error/timeout.
  let addresses: { address: string }[];
  try {
    addresses = await withTimeout(dnsPromises.lookup(host, { all: true }), 2000);
  } catch {
    return;
  }
  for (const { address } of addresses) {
    if (isPrivateIp(address)) throw new SsrfError('URL host resolves to a private or reserved address');
  }
}
