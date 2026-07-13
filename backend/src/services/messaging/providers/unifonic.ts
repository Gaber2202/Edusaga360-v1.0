/**
 * Unifonic (KSA) — SMS. POST https://el.cloud.unifonic.com/rest/SMS/messages
 * Form-encoded with an AppSid credential.
 */
import { MessagingProvider, assertChannel, getPath, missingFields, postAndParse, str } from '../types.js';

export const unifonic: MessagingProvider = {
  id: 'unifonic',
  label: 'Unifonic',
  channels: ['sms'],
  credentialFields: [{ key: 'app_sid', label: 'AppSid', required: true, secret: true }],
  configFields: [{ key: 'sender_id', label: 'Sender ID', required: false, placeholder: 'EduSaga' }],

  validate(config, credentials) {
    const missing = missingFields(this.credentialFields, credentials);
    return missing.length ? `Missing credentials: ${missing.join(', ')}` : null;
  },

  async send(ctx, msg) {
    assertChannel(this, msg.channel);
    const form = new URLSearchParams({
      AppSid: ctx.credentials.app_sid,
      Recipient: msg.to,
      Body: msg.text,
      ...(ctx.config.sender_id ? { SenderID: String(ctx.config.sender_id) } : {}),
    }).toString();

    const json = await postAndParse(
      ctx,
      'Unifonic',
      'https://el.cloud.unifonic.com/rest/SMS/messages',
      { 'Content-Type': 'application/x-www-form-urlencoded' },
      form,
    );
    return { id: str(getPath(json, 'data.MessageID')) };
  },
};
