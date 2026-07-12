/**
 * Email provider registry — the single list of supported mail providers.
 */
import { EmailProvider } from './types.js';
import { smtp } from './providers/smtp.js';
import { gmail } from './providers/gmail.js';
import { microsoft } from './providers/microsoft.js';
import { custom } from './providers/custom.js';

const PROVIDERS: Record<string, EmailProvider> = {
  [smtp.id]: smtp,
  [gmail.id]: gmail,
  [microsoft.id]: microsoft,
  [custom.id]: custom,
};

export function getProvider(id: string): EmailProvider | undefined {
  return PROVIDERS[id];
}

export function providerIds(): string[] {
  return Object.keys(PROVIDERS);
}

/** Secret-free descriptors for building the configuration UI. */
export function describeProviders() {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    capabilities: p.capabilities,
    credentialFields: p.credentialFields,
    configFields: p.configFields,
  }));
}
