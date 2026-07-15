/**
 * MSEGAT (KSA) — SMS. POST https://www.msegat.com/gw/sendsms.php (JSON).
 */
import { MessagingProvider, assertChannel, getPath, missingFields, postAndParse, str } from '../types.js';

export const msegat: MessagingProvider = {
  id: 'msegat',
  label: 'MSEGAT',
  channels: ['sms'],
  credentialFields: [
    { key: 'username', label: 'Username', required: true, secret: true },
    { key: 'api_key', label: 'API Key', required: true, secret: true },
  ],
  configFields: [{ key: 'sender', label: 'Sender name', required: true, placeholder: 'EduSaga' }],

  validate(config, credentials) {
    const missing = [...missingFields(this.credentialFields, credentials), ...missingFields(this.configFields, config)];
    return missing.length ? `Missing fields: ${missing.join(', ')}` : null;
  },

  async send(ctx, msg) {
    assertChannel(this, msg.channel);
    const body = JSON.stringify({
      userName: ctx.credentials.username,
      apiKey: ctx.credentials.api_key,
      numbers: msg.to,
      userSender: String(ctx.config.sender),
      msg: msg.text,
    });

    const json = await postAndParse(
      ctx,
      'MSEGAT',
      'https://www.msegat.com/gw/sendsms.php',
      { 'Content-Type': 'application/json' },
      body,
    );
    return { id: str(getPath(json, 'id')) };
  },
};
