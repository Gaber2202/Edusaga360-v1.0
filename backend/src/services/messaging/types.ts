/**
 * Messaging provider adapter contract + shared helpers.
 *
 * One module covers both SMS and WhatsApp because the major gateways (Infobip,
 * Twilio, ...) send both over a single account — WhatsApp is a channel, not a
 * separate integration. Each provider declares which channels it supports; the
 * routes layer only offers a channel a connector's provider can actually send.
 *
 * Providers do their own HTTP via an injectable fetch (default: global fetch).
 * Nothing here touches the DB.
 */
import { assertPublicUrl } from '../../lib/ssrfGuard.js';

export type Channel = 'sms' | 'whatsapp';

export interface FieldSpec {
  key: string;
  label: string;
  required: boolean;
  secret?: boolean;
  placeholder?: string;
}

export interface OutboundMessage {
  to: string;
  text: string;
  channel: Channel;
}

export interface MessagingContext {
  config: Record<string, unknown>;
  credentials: Record<string, string>;
  fetchImpl?: typeof fetch;
}

export interface MessagingProvider {
  id: string;
  label: string;
  channels: Channel[];
  credentialFields: FieldSpec[];
  configFields: FieldSpec[];
  validate(config: Record<string, unknown>, credentials: Record<string, string>): string | null;
  send(ctx: MessagingContext, message: OutboundMessage): Promise<{ id?: string }>;
}

export class MessagingError extends Error {}

// ── Shared helpers ────────────────────────────────────────────────────────────

export function missingFields(fields: FieldSpec[], values: Record<string, unknown>): string[] {
  return fields
    .filter((f) => f.required)
    .map((f) => f.key)
    .filter((k) => values[k] === undefined || values[k] === null || values[k] === '');
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    if (Array.isArray(acc)) return acc[Number(key)];
    if (typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

export function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

export function basicAuth(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

/** POST helper shared by providers; throws MessagingError on transport/non-2xx. */
export async function postAndParse(
  ctx: MessagingContext,
  label: string,
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<unknown> {
  // SSRF guard for admin-configured targets (custom send_url, Infobip base_url).
  try {
    await assertPublicUrl(url);
  } catch (e) {
    throw new MessagingError(`${label}: ${(e as Error).message}`);
  }

  const doFetch = ctx.fetchImpl ?? fetch;
  let resp: Response;
  try {
    resp = await doFetch(url, { method: 'POST', headers, body });
  } catch (e) {
    throw new MessagingError(`Could not reach ${label}: ${(e as Error).message}`);
  }
  if (!resp.ok) throw new MessagingError(`${label} returned HTTP ${resp.status}`);
  return resp.json().catch(() => ({}));
}

/** Guard: reject a channel the provider doesn't support. */
export function assertChannel(provider: MessagingProvider, channel: Channel): void {
  if (!provider.channels.includes(channel)) {
    throw new MessagingError(`${provider.label} does not support ${channel}`);
  }
}
