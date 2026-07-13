/**
 * Messaging provider registry — SMS + WhatsApp gateways.
 */
import { MessagingProvider } from './types.js';
import { infobip } from './providers/infobip.js';
import { twilio } from './providers/twilio.js';
import { unifonic } from './providers/unifonic.js';
import { msegat } from './providers/msegat.js';
import { taqnyat } from './providers/taqnyat.js';
import { metaWhatsapp } from './providers/metaWhatsapp.js';
import { custom } from './providers/custom.js';

const PROVIDERS: Record<string, MessagingProvider> = {
  [infobip.id]: infobip,
  [twilio.id]: twilio,
  [unifonic.id]: unifonic,
  [msegat.id]: msegat,
  [taqnyat.id]: taqnyat,
  [metaWhatsapp.id]: metaWhatsapp,
  [custom.id]: custom,
};

export function getProvider(id: string): MessagingProvider | undefined {
  return PROVIDERS[id];
}

export function providerIds(): string[] {
  return Object.keys(PROVIDERS);
}

/** Secret-free descriptors (incl. supported channels) for the config UI. */
export function describeProviders() {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    channels: p.channels,
    credentialFields: p.credentialFields,
    configFields: p.configFields,
  }));
}
