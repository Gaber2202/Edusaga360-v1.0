/**
 * ATS provider registry + adapters — validation, normalization, and the
 * config-driven custom provider. No DB, no live network; the fetch runner is
 * exercised with an injected fetch returning realistic provider payloads.
 */
import { describe, it, expect } from 'vitest';
import { getProvider, providerIds, describeProviders } from '../services/ats/registry.js';
import { fetchCandidates } from '../services/ats/sync.js';
import { AtsError } from '../services/ats/types.js';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe('registry', () => {
  it('registers all five providers', () => {
    expect(providerIds().sort()).toEqual(['custom', 'greenhouse', 'indeed', 'linkedin', 'workday']);
  });

  it('exposes secret-free descriptors (no credential values)', () => {
    const desc = describeProviders();
    const gh = desc.find((d) => d.id === 'greenhouse')!;
    expect(gh.label).toBe('Greenhouse');
    expect(gh.credentialFields[0]).toMatchObject({ key: 'api_key', secret: true });
  });
});

describe('validate()', () => {
  it('greenhouse requires api_key', () => {
    const p = getProvider('greenhouse')!;
    expect(p.validate({}, {})).toMatch(/api_key/);
    expect(p.validate({}, { api_key: 'k' })).toBeNull();
  });

  it('workday requires username, password, and report_url', () => {
    const p = getProvider('workday')!;
    expect(p.validate({}, {})).toMatch(/username|password|report_url/);
    expect(p.validate({ report_url: 'https://wd/r' }, { username: 'u', password: 'p' })).toBeNull();
  });

  it('custom requires base_url and a field_map with external_id + full_name', () => {
    const p = getProvider('custom')!;
    expect(p.validate({}, {})).toMatch(/base_url/);
    expect(p.validate({ base_url: 'https://x' }, { token: 't' })).toMatch(/field_map/);
    expect(
      p.validate({ base_url: 'https://x', field_map: { external_id: 'id', full_name: 'name' } }, { token: 't' }),
    ).toBeNull();
  });

  it('custom allows no token when auth_scheme is None', () => {
    const p = getProvider('custom')!;
    const cfg = { base_url: 'https://x', auth_scheme: 'None', field_map: { external_id: 'id', full_name: 'name' } };
    expect(p.validate(cfg, {})).toBeNull();
  });
});

describe('fetchCandidates() normalization', () => {
  it('normalizes a Greenhouse Harvest payload and sets Basic auth', async () => {
    const p = getProvider('greenhouse')!;
    let seenAuth: string | undefined;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      seenAuth = (init.headers as Record<string, string>).Authorization;
      return jsonResponse([
        {
          id: 42,
          first_name: 'Lina',
          last_name: 'Hassan',
          email_addresses: [{ value: 'lina@x.com' }],
          phone_numbers: [{ value: '+966500000000' }],
          applications: [{ status: 'active', applied_at: '2026-01-02', jobs: [{ name: 'Math Teacher' }] }],
        },
      ]);
    }) as unknown as typeof fetch;

    const out = await fetchCandidates(p, { config: {}, credentials: { api_key: 'secret' }, fetchImpl });
    expect(seenAuth).toBe(`Basic ${Buffer.from('secret:').toString('base64')}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      external_id: '42',
      full_name: 'Lina Hassan',
      email: 'lina@x.com',
      job_title: 'Math Teacher',
      stage: 'active',
    });
  });

  it('drops rows missing an id or name', async () => {
    const p = getProvider('greenhouse')!;
    const fetchImpl = (async () =>
      jsonResponse([
        { id: 1, first_name: 'Has', last_name: 'Name' },
        { id: 2 }, // no name -> dropped
        { first_name: 'No', last_name: 'Id' }, // no id -> dropped
      ])) as unknown as typeof fetch;
    const out = await fetchCandidates(p, { config: {}, credentials: { api_key: 'k' }, fetchImpl });
    expect(out).toHaveLength(1);
    expect(out[0].external_id).toBe('1');
  });

  it('drives the custom provider entirely from config (base_url, list_path, field_map)', async () => {
    const p = getProvider('custom')!;
    let seenUrl: string | undefined;
    let seenAuth: string | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seenUrl = url;
      seenAuth = (init.headers as Record<string, string>)['X-Api-Key'];
      return jsonResponse({
        data: { items: [{ ref: 'C-9', person: { name: 'Omar Q' }, contact: { mail: 'omar@x.com' }, role: 'Science Teacher' }] },
      });
    }) as unknown as typeof fetch;

    const config = {
      base_url: 'https://ats.example.com/candidates',
      list_path: 'data.items',
      auth_scheme: 'Token',
      auth_header: 'X-Api-Key',
      field_map: { external_id: 'ref', full_name: 'person.name', email: 'contact.mail', job_title: 'role' },
    };
    const out = await fetchCandidates(p, { config, credentials: { token: 'abc' }, fetchImpl });
    expect(seenUrl).toBe('https://ats.example.com/candidates');
    expect(seenAuth).toBe('Token abc');
    expect(out).toEqual([
      expect.objectContaining({ external_id: 'C-9', full_name: 'Omar Q', email: 'omar@x.com', job_title: 'Science Teacher' }),
    ]);
  });

  it('blocks a custom connector pointed at a private address (SSRF guard)', async () => {
    const p = getProvider('custom')!;
    const config = { base_url: 'http://169.254.169.254/candidates', field_map: { external_id: 'id', full_name: 'name' } };
    await expect(fetchCandidates(p, { config, credentials: { token: 't' } })).rejects.toBeInstanceOf(AtsError);
  });

  it('raises AtsError on a non-2xx provider response', async () => {
    const p = getProvider('greenhouse')!;
    const fetchImpl = (async () => jsonResponse({}, false, 401)) as unknown as typeof fetch;
    await expect(fetchCandidates(p, { config: {}, credentials: { api_key: 'k' }, fetchImpl })).rejects.toBeInstanceOf(AtsError);
  });
});
