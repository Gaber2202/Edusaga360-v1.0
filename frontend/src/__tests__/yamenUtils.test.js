import { describe, it, expect } from 'vitest';
import { extractAiText, aiErrorMessage } from '../components/yamen/yamenUtils';

describe('extractAiText (fixes React #31 — rendering {response})', () => {
  it('returns the response string from { response, provider }', () => {
    expect(extractAiText({ response: 'Hello', provider: 'claude' })).toBe('Hello');
  });
  it('passes through a plain string', () => {
    expect(extractAiText('Hi')).toBe('Hi');
  });
  it('stringifies a nested object response instead of returning an object', () => {
    const out = extractAiText({ response: { a: 1 } });
    expect(typeof out).toBe('string');
    expect(out).toContain('"a": 1');
  });
  it('never returns a non-string (the crash cause)', () => {
    for (const v of [null, undefined, { provider: 'x' }, {}, 42]) {
      expect(typeof extractAiText(v)).toBe('string');
    }
  });
});

describe('aiErrorMessage (friendly no-tokens message)', () => {
  it('maps quota/token/credit errors to "No AI tokens available"', () => {
    expect(aiErrorMessage(new Error('insufficient_quota'), false)).toBe('No AI tokens available');
    expect(aiErrorMessage(new Error('429 rate limit'), false)).toBe('No AI tokens available');
    expect(aiErrorMessage(new Error('billing credit exhausted'), true)).toBe('لا يوجد رصيد كافٍ من رموز الذكاء الاصطناعي');
  });
  it('falls back to a generic unavailable message otherwise', () => {
    expect(aiErrorMessage(new Error('network blip'), false)).toBe('AI service is currently unavailable');
  });
});
