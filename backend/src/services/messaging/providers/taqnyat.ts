/**
 * Taqnyat (KSA) — SMS. POST https://api.taqnyat.sa/v1/messages (Bearer token).
 */
import { MessagingProvider, assertChannel, getPath, missingFields, postAndParse, str } from '../types.js';

export const taqnyat: MessagingProvider = {
  id: 'taqnyat',
  label: 'Taqnyat',
  channels: ['sms'],
  credentialFields: [{ key: 'bearer_token', label: 'Bearer Token', required: true, secret: true }],
  configFields: [{ key: 'sender', label: 'Sender name', required: true, placeholder: 'EduSaga' }],

  validate(config, credentials) {
    const missing = [...missingFields(this.credentialFields, credentials), ...missingFields(this.configFields, config)];
    return missing.length ? `Missing fields: ${missing.join(', ')}` : null;
  },

  async send(ctx, msg) {
    assertChannel(this, msg.channel);
    const body = JSON.stringify({ recipients: [msg.to], body: msg.text, sender: String(ctx.config.sender) });
    const json = await postAndParse(
      ctx,
      'Taqnyat',
      'https://api.taqnyat.sa/v1/messages',
      { Authorization: `Bearer ${ctx.credentials.bearer_token}`, 'Content-Type': 'application/json' },
      body,
    );
    return { id: str(getPath(json, 'messageId')) };
  },
};
