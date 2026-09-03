import { describe, it, expect } from 'vitest';
import { htmlToPlainText } from '../lib/policyPdf';

describe('htmlToPlainText', () => {
  it('strips tags and decodes entities', () => {
    expect(htmlToPlainText('<p>Hello&nbsp;&amp; welcome</p>')).toBe('Hello & welcome');
  });

  it('turns lists into bullets', () => {
    const out = htmlToPlainText('<ul><li>One</li><li>Two</li></ul>');
    expect(out).toContain('• One');
    expect(out).toContain('• Two');
  });
});
