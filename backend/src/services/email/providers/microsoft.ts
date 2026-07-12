/**
 * Microsoft 365 provider — send + receive via Microsoft Graph with an OAuth
 * access token. Send uses /me/sendMail (202 Accepted); receive lists /me/messages
 * which returns full message resources in a single call.
 */
import { EmailError, EmailProvider, NormalizedEmail, asArray, getPath, missingFields, str } from '../types.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';

export const microsoft: EmailProvider = {
  id: 'microsoft',
  label: 'Microsoft 365 / Outlook',
  capabilities: { send: true, receive: true },
  credentialFields: [
    { key: 'access_token', label: 'OAuth Access Token', required: true, secret: true },
  ],
  configFields: [
    { key: 'save_to_sent', label: 'Save to Sent Items (true/false)', required: false },
  ],

  validate(_config, credentials) {
    const missing = missingFields(this.credentialFields, credentials);
    return missing.length ? `Missing credentials: ${missing.join(', ')}` : null;
  },

  async send(ctx, message) {
    const doFetch = ctx.fetchImpl ?? fetch;
    const body = {
      message: {
        subject: message.subject,
        body: { contentType: 'HTML', content: message.html ?? message.text ?? '' },
        toRecipients: [{ emailAddress: { address: message.to } }],
      },
      saveToSentItems: ctx.config.save_to_sent !== false,
    };
    let resp: Response;
    try {
      resp = await doFetch(`${GRAPH}/me/sendMail`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ctx.credentials.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new EmailError(`Could not reach Microsoft Graph: ${(e as Error).message}`);
    }
    if (!resp.ok) throw new EmailError(`Microsoft send failed: HTTP ${resp.status}`);
    return {};
  },

  async fetchMessages(ctx) {
    const doFetch = ctx.fetchImpl ?? fetch;
    const url = `${GRAPH}/me/messages?$top=25&$select=id,subject,bodyPreview,receivedDateTime,from,toRecipients`;
    let resp: Response;
    try {
      resp = await doFetch(url, { headers: { Authorization: `Bearer ${ctx.credentials.access_token}` } });
    } catch (e) {
      throw new EmailError(`Could not reach Microsoft Graph: ${(e as Error).message}`);
    }
    if (!resp.ok) throw new EmailError(`Microsoft fetch failed: HTTP ${resp.status}`);
    const json: unknown = await resp.json();
    return asArray(getPath(json, 'value'))
      .map((it): NormalizedEmail => ({
        external_id: str(getPath(it, 'id')) ?? '',
        from_address: str(getPath(it, 'from.emailAddress.address')),
        to_address: str(getPath(it, 'toRecipients.0.emailAddress.address')),
        subject: str(getPath(it, 'subject')),
        snippet: str(getPath(it, 'bodyPreview')),
        received_at: str(getPath(it, 'receivedDateTime')),
        raw: it,
      }))
      .filter((m) => !!m.external_id);
  },
};
