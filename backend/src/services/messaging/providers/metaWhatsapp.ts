/**
 * Meta WhatsApp Cloud API — WhatsApp only, direct from Meta (no aggregator).
 * POST https://graph.facebook.com/v21.0/{phone_number_id}/messages (Bearer token).
 */
import { MessagingProvider, assertChannel, getPath, missingFields, postAndParse, str } from '../types.js';

export const metaWhatsapp: MessagingProvider = {
  id: 'meta_whatsapp',
  label: 'WhatsApp Cloud API (Meta)',
  channels: ['whatsapp'],
  credentialFields: [{ key: 'access_token', label: 'Access Token', required: true, secret: true }],
  configFields: [
    { key: 'phone_number_id', label: 'Phone Number ID', required: true },
    { key: 'graph_version', label: 'Graph API version', required: false, placeholder: 'v21.0' },
  ],

  validate(config, credentials) {
    const missing = [...missingFields(this.credentialFields, credentials), ...missingFields(this.configFields, config)];
    return missing.length ? `Missing fields: ${missing.join(', ')}` : null;
  },

  async send(ctx, msg) {
    assertChannel(this, msg.channel);
    const version = str(ctx.config.graph_version) ?? 'v21.0';
    const url = `https://graph.facebook.com/${version}/${ctx.config.phone_number_id}/messages`;
    const body = JSON.stringify({ messaging_product: 'whatsapp', to: msg.to, type: 'text', text: { body: msg.text } });
    const json = await postAndParse(
      ctx,
      'WhatsApp Cloud API',
      url,
      { Authorization: `Bearer ${ctx.credentials.access_token}`, 'Content-Type': 'application/json' },
      body,
    );
    return { id: str(getPath(json, 'messages.0.id')) };
  },
};
