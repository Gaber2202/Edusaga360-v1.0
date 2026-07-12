/**
 * Email provider adapter contract + shared helpers.
 *
 * Each provider (smtp, gmail, microsoft, custom) knows how to SEND a message and,
 * where the transport supports it, RECEIVE (list) recent messages. Providers
 * declare their credential/config fields and capabilities; the routes layer
 * handles auth, encryption, and persistence.
 *
 * SMTP sends via nodemailer (injectable transport for tests); the REST providers
 * send/receive via fetch (injectable for tests). Nothing here touches the DB.
 */

/** A field the school must supply to configure a provider. */
export interface FieldSpec {
  key: string;
  label: string;
  required: boolean;
  secret?: boolean;
  placeholder?: string;
}

/** An outbound message to send through a connector. */
export interface OutboundMessage {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

/** A normalized inbound message, independent of source provider. */
export interface NormalizedEmail {
  external_id: string;
  from_address?: string;
  to_address?: string;
  subject?: string;
  snippet?: string;
  received_at?: string;
  raw: unknown;
}

/** Minimal nodemailer-like transport surface (so tests can inject a fake). */
export interface SmtpTransport {
  sendMail(mail: unknown): Promise<{ messageId?: string }>;
}

export interface EmailContext {
  config: Record<string, unknown>;
  credentials: Record<string, string>;
  /** Injectable fetch for REST providers; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable SMTP transport factory; defaults to nodemailer.createTransport. */
  createTransport?: (opts: unknown) => SmtpTransport;
}

export interface EmailProvider {
  id: string;
  label: string;
  capabilities: { send: boolean; receive: boolean };
  credentialFields: FieldSpec[];
  configFields: FieldSpec[];
  validate(config: Record<string, unknown>, credentials: Record<string, string>): string | null;
  send(ctx: EmailContext, message: OutboundMessage): Promise<{ id?: string }>;
  /** Present only when capabilities.receive is true. */
  fetchMessages?(ctx: EmailContext): Promise<NormalizedEmail[]>;
}

/** Thrown for any email provider/transport failure; mapped to a clean 4xx/5xx. */
export class EmailError extends Error {}

// ── Shared helpers ────────────────────────────────────────────────────────────

export function missingFields(fields: FieldSpec[], values: Record<string, unknown>): string[] {
  return fields
    .filter((f) => f.required)
    .map((f) => f.key)
    .filter((k) => values[k] === undefined || values[k] === null || values[k] === '');
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    if (Array.isArray(acc)) return acc[Number(key)];
    if (typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

export function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Build a minimal RFC-822 HTML message (used by the Gmail raw send API). */
export function buildRfc822(from: string, msg: OutboundMessage): string {
  const headers = [
    `From: ${from}`,
    `To: ${msg.to}`,
    `Subject: ${msg.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
  ];
  return `${headers.join('\r\n')}\r\n\r\n${msg.html ?? msg.text ?? ''}`;
}
