/**
 * Infobip — SMS + WhatsApp over one account.
 * Auth: `Authorization: App {api_key}` (same scheme as the email service).
 * SMS:      POST {base}/sms/2/text/advanced
 * WhatsApp: POST {base}/whatsapp/1/message/text
 */
import { normalizePhone } from '../../../lib/phone.js';
import { MessagingProvider, assertChannel, getPath, missingFields, postAndParse, str } from '../types.js';

export const infobip: MessagingProvider = {
  id: 'infobip',
  label: 'Infobip',
  channels: ['sms', 'whatsapp'],
  credentialFields: [{ key: 'api_key', label: 'API Key', required: true, secret: true }],
  configFields: [
    { key: 'base_url', label: 'Base URL', required: true, placeholder: 'https://xxxxx.api.infobip.com' },
    { key: 'sender', label: 'SMS Sender ID', required: false, placeholder: 'EduSaga' },
    { key: 'whatsapp_sender', label: 'WhatsApp Sender Number', required: false, placeholder: '9665xxxxxxxx' },
  ],

  validate(config, credentials) {
    const missing = [...missingFields(this.credentialFields, credentials), ...missingFields(this.configFields, config)];
    return missing.length ? `Missing fields: ${missing.join(', ')}` : null;
  },

  async send(ctx, msg) {
    assertChannel(this, msg.channel);
    const base = String(ctx.config.base_url).replace(/\/$/, '');
    const headers = {
      Authorization: `App ${ctx.credentials.api_key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    let url: string;
    let body: unknown;
    const to = normalizePhone(msg.to);
    if (msg.channel === 'whatsapp') {
      url = `${base}/whatsapp/1/message/text`;
      body = { from: String(ctx.config.whatsapp_sender ?? ctx.config.sender ?? ''), to, content: { text: msg.text } };
    } else {
      url = `${base}/sms/2/text/advanced`;
      body = { messages: [{ from: String(ctx.config.sender ?? 'EduSaga'), destinations: [{ to }], text: msg.text }] };
    }

    const json = await postAndParse(ctx, 'Infobip', url, headers, JSON.stringify(body));
    // SMS advanced response nests the id under messages[0].messageId; WhatsApp returns it at the top level as messageId.
    return { id: str(getPath(json, 'messages.0.messageId') ?? getPath(json, 'messageId')) };
  },
};
