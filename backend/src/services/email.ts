import https from 'https';

/**
 * Transactional email helpers built on Infobip's Email API.
 *
 * All outbound mail in the platform flows through here so we have a single,
 * SMTP-independent channel. Callers pass a fully-built link/token; these
 * helpers never mint Supabase recovery tokens themselves (that's the caller's
 * job) — which keeps the emailed link and any copyable fallback in sync on the
 * SAME token.
 */

export interface InfobipConfig {
  infobipKey: string;
  infobipBase: string;
}

/** Returns Infobip credentials from the environment, or null when not configured. */
export function getInfobipConfig(): InfobipConfig | null {
  const infobipKey = process.env.INFOBIP_API_KEY;
  const infobipBase = process.env.INFOBIP_BASE_URL;
  if (!infobipKey || !infobipBase) return null;
  return { infobipKey, infobipBase };
}

/** Low-level send. Resolves on a 2xx from Infobip, rejects otherwise. */
export async function sendInfobipEmail(opts: {
  infobipKey: string;
  infobipBase: string;
  recipient_email: string;
  subject: string;
  html: string;
}): Promise<void> {
  const { infobipKey, infobipBase, recipient_email, subject, html } = opts;
  const payload = JSON.stringify({
    messages: [{
      from: process.env.INFOBIP_SENDER_EMAIL || 'noreply@edusaga360.com',
      to: [{ to: recipient_email }],
      subject,
      htmlBody: html,
    }],
  });

  await new Promise<void>((resolve, reject) => {
    const url = new URL(`https://${infobipBase}/email/3/send`);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `App ${infobipKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`Infobip ${res.statusCode}: ${body}`));
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/** School-onboarding invitation (register a new school + start trial). */
export async function sendInviteEmail(opts: {
  infobipKey: string;
  infobipBase: string;
  recipient_email: string;
  recipient_name: string;
  school_name?: string | null;
  inviteLink: string;
  message?: string | null;
}): Promise<void> {
  const { infobipKey, infobipBase, recipient_email, recipient_name, school_name, inviteLink, message } = opts;
  const schoolLine = school_name ? `<p>School: <strong>${school_name}</strong></p>` : '';
  const customMsg = message ? `<p style="color:#555">${message}</p>` : '';
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2 style="color:#059669">You're invited to EduSaga 360</h2>
      <p>Hi ${recipient_name},</p>
      ${customMsg}
      ${schoolLine}
      <p>Click the button below to set up your school's account and start your free trial:</p>
      <p style="text-align:center;margin:32px 0">
        <a href="${inviteLink}" style="background:#059669;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold">
          Accept Invitation
        </a>
      </p>
      <p style="font-size:12px;color:#999">This link expires in 7 days. If you did not expect this email, you can safely ignore it.</p>
    </div>`;

  await sendInfobipEmail({ infobipKey, infobipBase, recipient_email, subject: `You're invited to try EduSaga 360`, html });
}

/**
 * Password-reset / set-password email.
 *
 * `actionLink` MUST be a recovery link the caller already generated
 * (e.g. via `supabase.auth.admin.generateLink({ type: 'recovery' })`) so the
 * emailed link and any copyable fallback share one — and only one — valid token.
 */
export async function sendPasswordResetEmail(opts: {
  infobipKey: string;
  infobipBase: string;
  recipient_email: string;
  recipient_name?: string | null;
  actionLink: string;
  /** When true, phrases the email as a first-time "set your password" invite. */
  isInvite?: boolean;
}): Promise<void> {
  const { infobipKey, infobipBase, recipient_email, recipient_name, actionLink, isInvite } = opts;
  const name = recipient_name || 'there';
  const heading = isInvite ? 'Set up your EduSaga 360 password' : 'Reset your EduSaga 360 password';
  const intro = isInvite
    ? 'An administrator has created an account for you. Click the button below to set your password and sign in:'
    : 'We received a request to reset your EduSaga 360 password. Click the button below to choose a new one:';
  const cta = isInvite ? 'Set Password' : 'Reset Password';
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2 style="color:#059669">${heading}</h2>
      <p>Hi ${name},</p>
      <p>${intro}</p>
      <p style="text-align:center;margin:32px 0">
        <a href="${actionLink}" style="background:#059669;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold">
          ${cta}
        </a>
      </p>
      <p style="font-size:12px;color:#999">This link can only be used once and expires shortly. If you didn't request this, you can safely ignore this email and your password will stay the same.</p>
    </div>`;

  await sendInfobipEmail({
    infobipKey,
    infobipBase,
    recipient_email,
    subject: isInvite ? 'Set up your EduSaga 360 account' : 'Reset your EduSaga 360 password',
    html,
  });
}
