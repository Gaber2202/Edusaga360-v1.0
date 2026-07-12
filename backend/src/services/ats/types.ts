/**
 * ATS provider adapter contract + shared helpers.
 *
 * Each supported ATS (LinkedIn Talent, Indeed, Greenhouse, Workday, custom)
 * implements `AtsProvider`. A provider does NOT do its own HTTP — it declares
 * which credential/config fields it needs, validates them, and builds a
 * `ProviderPlan` (URL + headers + how to pull the candidate list out of the
 * response and map each item to a normalized candidate). A single runner in
 * sync.ts executes the plan, so the network path is written and tested once and
 * providers stay tiny, declarative, and unit-testable without live credentials.
 */

/** Canonical candidate shape after normalization, independent of source ATS. */
export interface NormalizedCandidate {
  external_id: string;
  full_name: string;
  email?: string;
  phone?: string;
  job_title?: string;
  stage?: string;
  applied_at?: string;
  raw: unknown;
}

/** A field the school must supply to configure a provider. */
export interface FieldSpec {
  key: string;
  label: string;
  required: boolean;
  /** Credential (secret, stored encrypted) vs. plain config. */
  secret?: boolean;
  placeholder?: string;
}

/** Everything the runner needs to execute one provider fetch. */
export interface ProviderPlan {
  url: string;
  method?: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  /** Pull the array of raw candidate items out of the parsed response. */
  extractList: (json: unknown) => unknown[];
  /** Map one raw item to a normalized candidate. */
  mapItem: (item: unknown) => NormalizedCandidate;
}

export interface AtsProviderContext {
  credentials: Record<string, string>;
  config: Record<string, unknown>;
  /** Injectable fetch for tests; defaults to global fetch in the runner. */
  fetchImpl?: typeof fetch;
}

export interface AtsProvider {
  id: string;
  label: string;
  /** Secret fields (encrypted at rest). */
  credentialFields: FieldSpec[];
  /** Non-secret settings (board id, base url, field map, ...). */
  configFields: FieldSpec[];
  /** Return a human-readable error if config/credentials are unusable, else null. */
  validate(config: Record<string, unknown>, credentials: Record<string, string>): string | null;
  /** Build the fetch plan. Only called after validate() passes. */
  buildPlan(config: Record<string, unknown>, credentials: Record<string, string>): ProviderPlan;
}

/** Thrown for any ATS provider/transport failure; carried up to a clean 4xx/5xx. */
export class AtsError extends Error {}

// ── Helpers shared by provider adapters ───────────────────────────────────────

/** Names of `required` fields that are missing/blank in `values`. */
export function missingFields(fields: FieldSpec[], values: Record<string, unknown>): string[] {
  return fields
    .filter((f) => f.required)
    .map((f) => f.key)
    .filter((k) => values[k] === undefined || values[k] === null || values[k] === '');
}

/** Safe dotted-path read, supporting array indices, e.g. "a.b.0.c". */
export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    if (Array.isArray(acc)) return acc[Number(key)];
    if (typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

/** Coerce a scalar to string, or undefined for objects/null/absent. */
export function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

/** Return v if it's an array, else []. */
export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** HTTP Basic auth header value for `user:pass`. */
export function basicAuth(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}
