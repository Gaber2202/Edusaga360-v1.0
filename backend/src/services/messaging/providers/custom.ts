/**
 * Custom gateway — the escape hatch. POSTs { to, text, channel } to a
 * configurable URL with optional Bearer/Basic auth. Supports both channels.
 *
 * config: send_url (required), auth_scheme (Bearer|Basic|None), auth_header.
 * credentials: token (unless auth_scheme=None).
 */
import { MessagingProvider, assertChannel, getPath, postAndParse, str } from '../types.js';

function authHeaders(config: Record<string, unknown>, credentials: Record<string, string>): Record<string, string> {
  const scheme = String(config.auth_scheme ?? 'Bearer');
  if (scheme.toLowerCase() === 'none' || !credentials.token) return {};
  const headerName = str(config.auth_header) ?? 'Authorization';
  const value = scheme.toLowerCase() === 'basic'
    ? `Basic ${Buffer.from(credentials.token).toString('base64')}`
    : `${scheme} ${credentials.token}`;
  return { [headerName]: value };
}

export const custom: MessagingProvider = {
  id: 'custom',
  label: 'Custom Gateway',
  channels: ['sms', 'whatsapp'],
  credentialFields: [{ key: 'token', label: 'API Token / Secret', required: false, secret: true }],
  configFields: [
    { key: 'send_url', label: 'Send Endpoint URL', required: true },
    { key: 'auth_scheme', label: 'Auth scheme: Bearer | Basic | None', required: false },
    { key: 'auth_header', label: 'Auth header name (default Authorization)', required: false },
  ],

  validate(config, credentials) {
    if (!config.send_url) return 'Missing config: send_url';
    const scheme = String(config.auth_scheme ?? 'Bearer').toLowerCase();
    if (scheme !== 'none' && !credentials.token) return 'Missing credentials: token';
    return null;
  },

  async send(ctx, msg) {
    assertChannel(this, msg.channel);
    const body = JSON.stringify({ to: msg.to, text: msg.text, channel: msg.channel });
    const json = await postAndParse(
      ctx,
      'Gateway',
      String(ctx.config.send_url),
      { 'Content-Type': 'application/json', ...authHeaders(ctx.config, ctx.credentials) },
      body,
    );
    return { id: str(getPath(json, 'id')) };
  },
};
