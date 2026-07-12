/**
 * Gmail provider (Google Workspace) — send via the Gmail API with an OAuth
 * access token.
 *
 * Send-only for now: inbound needs the two-step list→get message expansion the
 * Gmail API requires, which is a follow-up. capabilities.receive is false.
 */
import { EmailError, EmailProvider, buildRfc822, getPath, missingFields, str } from '../types.js';

export const gmail: EmailProvider = {
  id: 'gmail',
  label: 'Gmail / Google Workspace',
  capabilities: { send: true, receive: false },
  credentialFields: [
    { key: 'access_token', label: 'OAuth Access Token', required: true, secret: true },
  ],
  configFields: [
    { key: 'from', label: 'From address', required: true, placeholder: 'noreply@school.sa' },
  ],

  validate(config, credentials) {
    const missing = [
      ...missingFields(this.credentialFields, credentials),
      ...missingFields(this.configFields, config),
    ];
    return missing.length ? `Missing fields: ${missing.join(', ')}` : null;
  },

  async send(ctx, message) {
    const raw = Buffer.from(buildRfc822(String(ctx.config.from), message)).toString('base64url');
    const doFetch = ctx.fetchImpl ?? fetch;
    let resp: Response;
    try {
      resp = await doFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ctx.credentials.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      });
    } catch (e) {
      throw new EmailError(`Could not reach Gmail: ${(e as Error).message}`);
    }
    if (!resp.ok) throw new EmailError(`Gmail send failed: HTTP ${resp.status}`);
    const json: unknown = await resp.json().catch(() => ({}));
    return { id: str(getPath(json, 'id')) };
  },
};
