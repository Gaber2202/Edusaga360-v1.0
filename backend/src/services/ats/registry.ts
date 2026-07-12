/**
 * ATS provider registry — the single place that knows every supported ATS.
 * Add a provider by implementing AtsProvider and listing it here.
 */
import { AtsProvider } from './types.js';
import { greenhouse } from './providers/greenhouse.js';
import { workday } from './providers/workday.js';
import { linkedin } from './providers/linkedin.js';
import { indeed } from './providers/indeed.js';
import { custom } from './providers/custom.js';

const PROVIDERS: Record<string, AtsProvider> = {
  [linkedin.id]: linkedin,
  [indeed.id]: indeed,
  [greenhouse.id]: greenhouse,
  [workday.id]: workday,
  [custom.id]: custom,
};

/** Look up a provider adapter by id, or undefined if unknown. */
export function getProvider(id: string): AtsProvider | undefined {
  return PROVIDERS[id];
}

/** All provider ids. */
export function providerIds(): string[] {
  return Object.keys(PROVIDERS);
}

/** Public, secret-free descriptors for building the configuration UI. */
export function describeProviders() {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    credentialFields: p.credentialFields,
    configFields: p.configFields,
  }));
}
