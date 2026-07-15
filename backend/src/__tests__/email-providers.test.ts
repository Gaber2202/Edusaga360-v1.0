/**
 * Email provider registry + adapters — capabilities, validation, send, and
 * inbound normalization. SMTP send uses an injected transport; the REST
 * providers use an injected fetch. No DB, no live network.
 */
import { describe, it, expect } from 'vitest';
import { getProvider, providerIds, describeProviders } from '../services/email/registry.js';
import { EmailError } from '../services/email/types.js';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe('registry', () => {
  it('registers the four providers with their capabilities', () => {
    expect(providerIds().sort()).toEqual(['custom', 'gmail', 'microsoft', 'smtp']);
    const caps = Object.fromEntries(describeProviders().map((p) => [p.id, p.capabilities]));
    expect(caps.smtp).toEqual({ send: true, receive: false });
    expect(caps.microsoft).toEqual({ send: true, receive: true });
    expect(caps.gmail).toEqual({ send: true, receive: false });
    expect(caps.custom).toEqual({ send: true, receive: true });
  });
});

describe('validate()', () => {
  it('smtp requires host/port/from + user/pass', () => {
    const p = getProvider('smtp')!;
    expect(p.validate({}, {})).toMatch(/host|port|from|user|pass/);
    expect(p.validate({ host: 'h', port: 587, from: 'a@b' }, { user: 'u', pass: 'p' })).toBeNull();
  });

  it('custom requires send_url and a token unless auth None', () => {
    const p = getProvider('custom')!;
    expect(p.validate({}, {})).toMatch(/send_url/);
    expect(p.validate({ send_url: 'https://x' }, {})).toMatch(/token/);
    expect(p.validate({ send_url: 'https://x', auth_scheme: 'None' }, {})).toBeNull();
  });

  it('custom requires field_map.external_id when messages_url is set', () => {
    const p = getProvider('custom')!;
    expect(p.validate({ send_url: 'https://s', messages_url: 'https://m', auth_scheme: 'None' }, {})).toMatch(/external_id/);
    expect(
      p.validate({ send_url: 'https://s', messages_url: 'https://m', auth_scheme: 'None', field_map: { external_id: 'id' } }, {}),
    ).toBeNull();
  });
});

describe('send()', () => {
  it('smtp sends via the injected transport with the configured from', async () => {
    const p = getProvider('smtp')!;
    let sent: Record<string, unknown> | undefined;
    const createTransport = () => ({
      sendMail: async (m: unknown) => {
        sent = m as Record<string, unknown>;
        return { messageId: 'smtp-1' };
      },
    });
    const out = await p.send(
      { config: { host: 'h', port: 587, from: 'noreply@school.sa' }, credentials: { user: 'u', pass: 'p' }, createTransport },
      { to: 'x@y.com', subject: 'Hi', html: '<b>Hi</b>' },
    );
    expect(out.id).toBe('smtp-1');
    expect(sent).toMatchObject({ from: 'noreply@school.sa', to: 'x@y.com', subject: 'Hi' });
  });

  it('gmail base64url-encodes an RFC822 message to the send API', async () => {
    const p = getProvider('gmail')!;
    let body: Record<string, unknown> | undefined;
    let url: string | undefined;
    const fetchImpl = (async (u: string, init: RequestInit) => {
      url = u;
      body = JSON.parse(init.body as string);
      return jsonResponse({ id: 'gmail-1' });
    }) as unknown as typeof fetch;
    const out = await p.send({ config: { from: 'a@school.sa' }, credentials: { access_token: 'tok' }, fetchImpl }, { to: 'x@y.com', subject: 'S', html: 'H' });
    expect(url).toContain('gmail.googleapis.com');
    const decoded = Buffer.from(String(body!.raw), 'base64url').toString();
    expect(decoded).toContain('To: x@y.com');
    expect(decoded).toContain('Subject: S');
    expect(out.id).toBe('gmail-1');
  });

  it('microsoft posts a Graph sendMail payload (202, no body)', async () => {
    const p = getProvider('microsoft')!;
    let body: Record<string, unknown> | undefined;
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return jsonResponse(null, true, 202);
    }) as unknown as typeof fetch;
    await p.send({ config: {}, credentials: { access_token: 'tok' }, fetchImpl }, { to: 'x@y.com', subject: 'S', html: 'H' });
    expect(getNested(body, 'message.subject')).toBe('S');
    expect(getNested(body, 'message.toRecipients.0.emailAddress.address')).toBe('x@y.com');
  });

  it('blocks a custom gateway pointed at a private address (SSRF guard)', async () => {
    const p = getProvider('custom')!;
    await expect(
      p.send({ config: { send_url: 'http://127.0.0.1:25/send', auth_scheme: 'None' }, credentials: {} }, { to: 'x@y.com', subject: 's', text: 't' }),
    ).rejects.toBeInstanceOf(EmailError);
  });

  it('raises EmailError on a failed send', async () => {
    const p = getProvider('gmail')!;
    const fetchImpl = (async () => jsonResponse({}, false, 401)) as unknown as typeof fetch;
    await expect(
      p.send({ config: { from: 'a@b' }, credentials: { access_token: 't' }, fetchImpl }, { to: 'x@y', subject: 's', text: 't' }),
    ).rejects.toBeInstanceOf(EmailError);
  });
});

describe('fetchMessages() (inbound)', () => {
  it('microsoft normalizes a Graph messages list', async () => {
    const p = getProvider('microsoft')!;
    const fetchImpl = (async () =>
      jsonResponse({
        value: [
          {
            id: 'm1',
            subject: 'Admission inquiry',
            bodyPreview: 'Hello...',
            receivedDateTime: '2026-07-01T10:00:00Z',
            from: { emailAddress: { address: 'parent@x.com' } },
            toRecipients: [{ emailAddress: { address: 'info@school.sa' } }],
          },
        ],
      })) as unknown as typeof fetch;
    const out = await p.fetchMessages!({ config: {}, credentials: { access_token: 't' }, fetchImpl });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ external_id: 'm1', from_address: 'parent@x.com', subject: 'Admission inquiry', snippet: 'Hello...' });
  });

  it('custom maps inbound via field_map + list_path', async () => {
    const p = getProvider('custom')!;
    const fetchImpl = (async () =>
      jsonResponse({ data: { items: [{ mid: 'C-1', sender: 'a@x.com', subj: 'Hi' }] } })) as unknown as typeof fetch;
    const config = {
      send_url: 'https://s',
      messages_url: 'https://m',
      list_path: 'data.items',
      auth_scheme: 'None',
      field_map: { external_id: 'mid', from_address: 'sender', subject: 'subj' },
    };
    const out = await p.fetchMessages!({ config, credentials: {}, fetchImpl });
    expect(out).toEqual([expect.objectContaining({ external_id: 'C-1', from_address: 'a@x.com', subject: 'Hi' })]);
  });
});

// Small helper so the microsoft body assertion stays readable.
function getNested(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => {
    if (acc == null) return undefined;
    if (Array.isArray(acc)) return acc[Number(k)];
    if (typeof acc === 'object') return (acc as Record<string, unknown>)[k];
    return undefined;
  }, obj);
}
