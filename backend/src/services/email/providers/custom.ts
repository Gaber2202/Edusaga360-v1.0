/**
 * Custom email provider — the escape hatch for any HTTP mail gateway.
 *
 * Send: POST { to, subject, html, text } to config.send_url with an optional
 * bearer/basic token. Receive (optional): GET config.messages_url and map the
 * response with list_path + field_map, exactly like the custom ATS provider.
 *
 * config:
 *   send_url      (required for send)  URL that accepts a JSON send payload.
 *   messages_url  (optional)           URL returning a JSON list of messages.
 *   list_path     (optional)           Dotted path to the array in that response.
 *   auth_scheme   (optional)           "Bearer" (default) | "Basic" | "None".
 *   auth_header   (optional)           Header name (default "Authorization").
 *   field_map     (required for receive)  Map of normalized field → source path;
 *                                          must include external_id.
 * credentials:
 *   token         (required unless auth_scheme=None)
 */
import { EmailError, EmailProvider, NormalizedEmail, asArray, getPath, str } from '../types.js';

function fieldMapOf(config: Record<string, unknown>): Record<string, string> {
  const fm = config.field_map;
  return fm && typeof fm === 'object' ? (fm as Record<string, string>) : {};
}

function authHeaders(config: Record<string, unknown>, credentials: Record<string, string>): Record<string, string> {
  const scheme = String(config.auth_scheme ?? 'Bearer');
  if (scheme.toLowerCase() === 'none' || !credentials.token) return {};
  const headerName = str(config.auth_header) ?? 'Authorization';
  const value = scheme.toLowerCase() === 'basic'
    ? `Basic ${Buffer.from(credentials.token).toString('base64')}`
    : `${scheme} ${credentials.token}`;
  return { [headerName]: value };
}

export const custom: EmailProvider = {
  id: 'custom',
  label: 'Custom Gateway',
  capabilities: { send: true, receive: true },
  credentialFields: [
    { key: 'token', label: 'API Token / Secret', required: false, secret: true },
  ],
  configFields: [
    { key: 'send_url', label: 'Send Endpoint URL', required: true },
    { key: 'messages_url', label: 'Inbound Messages URL (optional)', required: false },
    { key: 'list_path', label: 'Path to message array (e.g. data.items)', required: false },
    { key: 'auth_scheme', label: 'Auth scheme: Bearer | Basic | None', required: false },
    { key: 'auth_header', label: 'Auth header name (default Authorization)', required: false },
    { key: 'field_map', label: 'Inbound field mapping (JSON)', required: false },
  ],

  validate(config, credentials) {
    if (!config.send_url) return 'Missing config: send_url';
    const scheme = String(config.auth_scheme ?? 'Bearer').toLowerCase();
    if (scheme !== 'none' && !credentials.token) return 'Missing credentials: token';
    if (config.messages_url && !fieldMapOf(config).external_id) {
      return 'field_map.external_id is required to receive messages';
    }
    return null;
  },

  async send(ctx, message) {
    const doFetch = ctx.fetchImpl ?? fetch;
    let resp: Response;
    try {
      resp = await doFetch(String(ctx.config.send_url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(ctx.config, ctx.credentials) },
        body: JSON.stringify({ to: message.to, subject: message.subject, html: message.html, text: message.text }),
      });
    } catch (e) {
      throw new EmailError(`Could not reach gateway: ${(e as Error).message}`);
    }
    if (!resp.ok) throw new EmailError(`Gateway send failed: HTTP ${resp.status}`);
    const json: unknown = await resp.json().catch(() => ({}));
    return { id: str(getPath(json, 'id')) };
  },

  async fetchMessages(ctx) {
    const messagesUrl = str(ctx.config.messages_url);
    if (!messagesUrl) return [];
    const fm = fieldMapOf(ctx.config);
    const listPath = str(ctx.config.list_path);
    const doFetch = ctx.fetchImpl ?? fetch;

    let resp: Response;
    try {
      resp = await doFetch(messagesUrl, { headers: authHeaders(ctx.config, ctx.credentials) });
    } catch (e) {
      throw new EmailError(`Could not reach gateway: ${(e as Error).message}`);
    }
    if (!resp.ok) throw new EmailError(`Gateway fetch failed: HTTP ${resp.status}`);
    const json: unknown = await resp.json();
    const list = listPath ? asArray(getPath(json, listPath)) : asArray(json);
    const pick = (item: unknown, key: string): string | undefined =>
      fm[key] ? str(getPath(item, fm[key])) : undefined;

    return list
      .map((it): NormalizedEmail => ({
        external_id: pick(it, 'external_id') ?? '',
        from_address: pick(it, 'from_address'),
        to_address: pick(it, 'to_address'),
        subject: pick(it, 'subject'),
        snippet: pick(it, 'snippet'),
        received_at: pick(it, 'received_at'),
        raw: it,
      }))
      .filter((m) => !!m.external_id);
  },
};
