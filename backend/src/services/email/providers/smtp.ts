/**
 * SMTP provider — send from any standard mail server via nodemailer.
 * Send-only (inbound would require IMAP, a separate transport).
 */
import nodemailer from 'nodemailer';
import { EmailError, EmailProvider, SmtpTransport, missingFields } from '../types.js';

export const smtp: EmailProvider = {
  id: 'smtp',
  label: 'SMTP',
  capabilities: { send: true, receive: false },
  credentialFields: [
    { key: 'user', label: 'SMTP Username', required: true, secret: true },
    { key: 'pass', label: 'SMTP Password', required: true, secret: true },
  ],
  configFields: [
    { key: 'host', label: 'SMTP Host', required: true, placeholder: 'smtp.example.com' },
    { key: 'port', label: 'Port', required: true, placeholder: '587' },
    { key: 'from', label: 'From address', required: true, placeholder: 'noreply@school.sa' },
    { key: 'secure', label: 'Use TLS (true for port 465)', required: false },
  ],

  validate(config, credentials) {
    const missing = [
      ...missingFields(this.credentialFields, credentials),
      ...missingFields(this.configFields, config),
    ];
    return missing.length ? `Missing fields: ${missing.join(', ')}` : null;
  },

  async send(ctx, message) {
    const port = Number(ctx.config.port) || 587;
    const factory = ctx.createTransport ?? ((opts: unknown) => nodemailer.createTransport(opts as never) as unknown as SmtpTransport);
    const transport = factory({
      host: String(ctx.config.host),
      port,
      secure: ctx.config.secure === true || port === 465,
      auth: { user: ctx.credentials.user, pass: ctx.credentials.pass },
    });

    try {
      const info = await transport.sendMail({
        from: String(ctx.config.from),
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      return { id: info.messageId };
    } catch (e) {
      throw new EmailError(`SMTP send failed: ${(e as Error).message}`);
    }
  },
};
