/**
 * Twilio — SMS + WhatsApp. Auth: HTTP Basic (Account SID : Auth Token).
 * POST https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json
 * WhatsApp uses the `whatsapp:` address prefix on To/From.
 */
import { MessagingProvider, assertChannel, basicAuth, getPath, missingFields, postAndParse, str } from '../types.js';

export const twilio: MessagingProvider = {
  id: 'twilio',
  label: 'Twilio',
  channels: ['sms', 'whatsapp'],
  credentialFields: [
    { key: 'account_sid', label: 'Account SID', required: true, secret: true },
    { key: 'auth_token', label: 'Auth Token', required: true, secret: true },
  ],
  configFields: [
    { key: 'from', label: 'SMS From number', required: false, placeholder: '+1...' },
    { key: 'whatsapp_from', label: 'WhatsApp From number', required: false, placeholder: '+1...' },
  ],

  validate(config, credentials) {
    const missing = missingFields(this.credentialFields, credentials);
    return missing.length ? `Missing credentials: ${missing.join(', ')}` : null;
  },

  async send(ctx, msg) {
    assertChannel(this, msg.channel);
    const sid = ctx.credentials.account_sid;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const from = msg.channel === 'whatsapp' ? `whatsapp:${ctx.config.whatsapp_from ?? ''}` : String(ctx.config.from ?? '');
    const to = msg.channel === 'whatsapp' ? `whatsapp:${msg.to}` : msg.to;

    const form = new URLSearchParams({ To: to, From: from, Body: msg.text }).toString();
    const headers = {
      Authorization: basicAuth(sid, ctx.credentials.auth_token),
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    const json = await postAndParse(ctx, 'Twilio', url, headers, form);
    return { id: str(getPath(json, 'sid')) };
  },
};
