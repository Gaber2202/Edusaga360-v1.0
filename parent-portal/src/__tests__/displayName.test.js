import { describe, it, expect } from 'vitest';
import { parentDisplayName } from '../lib/displayName';

describe('parentDisplayName', () => {
  it('joins first and last name', () => {
    expect(parentDisplayName({ first_name: 'Abdullah', last_name: 'Al-Farsi' })).toBe('Abdullah Al-Farsi');
  });
  it('falls back to name then email', () => {
    expect(parentDisplayName({ name: 'Sara' })).toBe('Sara');
    expect(parentDisplayName({ email: 'parent@school.sa' })).toBe('parent@school.sa');
  });
  it('returns empty string for missing user', () => {
    expect(parentDisplayName(null)).toBe('');
  });
});
