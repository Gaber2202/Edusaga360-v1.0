/**
 * Messaging provider registry + adapters — channels, validation, and send
 * request shaping (SMS vs WhatsApp) with an injected fetch. No DB, no network.
 */
import { describe, it, expect } from 'vitest';
import { getProvider, providerIds, describeProviders } from '../services/messaging/registry.js';
import { MessagingError } from '../services/messaging/types.js';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

// Capture the last fetch call so tests can assert URL/headers/body.
function capturingFetch(response: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return jsonResponse(response);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('registry', () => {
  it('registers all messaging providers with channels', () => {
    expect(providerIds().sort()).toEqual(['custom', 'infobip', 'meta_whatsapp', 'msegat', 'taqnyat', 'twilio', 'unifonic']);
    const byId = Object.fromEntries(describeProviders().map((p) => [p.id, p.channels]));
    expect(byId.infobip).toEqual(['sms', 'whatsapp']);
    expect(byId.twilio).toEqual(['sms', 'whatsapp']);
    expect(byId.meta_whatsapp).toEqual(['whatsapp']);
    expect(byId.unifonic).toEqual(['sms']);
  });
});

describe('validate()', () => {
  it('infobip requires api_key + base_url', () => {
    const p = getProvider('infobip')!;
    expect(p.validate({}, {})).toMatch(/api_key|base_url/);
    expect(p.validate({ base_url: 'https://x.api.infobip.com' }, { api_key: 'k' })).toBeNull();
  });

  it('meta_whatsapp requires access_token + phone_number_id', () => {
    const p = getProvider('meta_whatsapp')!;
    expect(p.validate({}, {})).toMatch(/access_token|phone_number_id/);
    expect(p.validate({ phone_number_id: '123' }, { access_token: 't' })).toBeNull();
  });
});

describe('Infobip send()', () => {
  it('routes SMS to the sms endpoint with App auth', async () => {
    const p = getProvider('infobip')!;
    const { fetchImpl, calls } = capturingFetch({ messages: [{ messageId: 'sms-1' }] });
    const out = await p.send(
      { config: { base_url: 'https://x.api.infobip.com/', sender: 'EduSaga' }, credentials: { api_key: 'secret' }, fetchImpl },
      { to: '966500000000', text: 'Hi', channel: 'sms' },
    );
    expect(calls[0].url).toBe('https://x.api.infobip.com/sms/2/text/advanced');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('App secret');
    expect(out.id).toBe('sms-1');
  });

  it('routes WhatsApp to the whatsapp endpoint', async () => {
    const p = getProvider('infobip')!;
    const { fetchImpl, calls } = capturingFetch({ messages: [{ messageId: 'wa-1' }] });
    await p.send(
      { config: { base_url: 'https://x.api.infobip.com', whatsapp_sender: '966500000000' }, credentials: { api_key: 'k' }, fetchImpl },
      { to: '966511111111', text: 'Hi', channel: 'whatsapp' },
    );
    expect(calls[0].url).toBe('https://x.api.infobip.com/whatsapp/1/message/text');
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.content.text).toBe('Hi');
  });
});

describe('Twilio send()', () => {
  it('prefixes whatsapp: on To/From for the WhatsApp channel', async () => {
    const p = getProvider('twilio')!;
    const { fetchImpl, calls } = capturingFetch({ sid: 'SM1' });
    await p.send(
      { config: { whatsapp_from: '+100' }, credentials: { account_sid: 'AC', auth_token: 't' }, fetchImpl },
      { to: '+200', text: 'Hi', channel: 'whatsapp' },
    );
    const body = new URLSearchParams(calls[0].init.body as string);
    expect(body.get('To')).toBe('whatsapp:+200');
    expect(body.get('From')).toBe('whatsapp:+100');
  });
});

describe('channel guard', () => {
  it('rejects an unsupported channel (WhatsApp on a Meta WhatsApp-only provider is fine, SMS is not)', async () => {
    const p = getProvider('meta_whatsapp')!;
    await expect(
      p.send({ config: { phone_number_id: '1' }, credentials: { access_token: 't' } }, { to: '+1', text: 'x', channel: 'sms' }),
    ).rejects.toBeInstanceOf(MessagingError);
  });

  it('raises MessagingError on a non-2xx provider response', async () => {
    const p = getProvider('taqnyat')!;
    const fetchImpl = (async () => jsonResponse({}, false, 401)) as unknown as typeof fetch;
    await expect(
      p.send({ config: { sender: 'X' }, credentials: { bearer_token: 't' }, fetchImpl }, { to: '+1', text: 'x', channel: 'sms' }),
    ).rejects.toBeInstanceOf(MessagingError);
  });
});
