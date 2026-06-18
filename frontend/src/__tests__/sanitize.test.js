/**
 * HTML sanitizer — XSS defence + bilingual/RTL preservation.
 *
 * Tenant-authored rich text is rendered via dangerouslySetInnerHTML, so the
 * sanitizer is the boundary that prevents cross-tenant XSS. It must ALSO keep
 * the `dir` and `lang` attributes intact, otherwise Arabic (RTL) content would
 * render left-to-right and break the bilingual UI (priority scenario #2/#6).
 */
import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '@/lib/sanitize';

describe('sanitizeHtml — security', () => {
  it('removes <script> tags (keeping any visible text)', () => {
    // NB: a benign script body is used because the happy-dom test environment
    // (unlike a real browser's DOMParser) executes inline scripts on parse.
    // The security contract under test is that the OUTPUT contains no <script>.
    const out = sanitizeHtml('<p>Hello</p><script>1+1</script>');
    expect(out).not.toMatch(/<script/i);
    expect(out).toContain('Hello');
  });

  it('strips inline event-handler attributes', () => {
    const out = sanitizeHtml('<img src="x" onerror="steal()" />');
    expect(out).not.toMatch(/onerror/i);
  });

  it('blocks javascript: URLs in anchors', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toMatch(/javascript:/i);
    expect(out).toContain('click');
  });

  it('allows safe https/mailto URLs', () => {
    expect(sanitizeHtml('<a href="https://edusaga360.com">site</a>')).toContain('href="https://edusaga360.com"');
    expect(sanitizeHtml('<a href="mailto:info@edusaga360.com">mail</a>')).toContain('mailto:');
  });

  it('hardens target="_blank" anchors with rel="noopener noreferrer"', () => {
    const out = sanitizeHtml('<a href="https://x.com" target="_blank">x</a>');
    expect(out).toMatch(/rel="[^"]*noopener[^"]*"/);
    expect(out).toMatch(/rel="[^"]*noreferrer[^"]*"/);
  });

  it('returns an empty string for non-string / empty input', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml(undefined)).toBe('');
    expect(sanitizeHtml(42)).toBe('');
  });
});

describe('sanitizeHtml — bilingual / RTL preservation', () => {
  it('preserves dir and lang attributes (RTL Arabic support)', () => {
    const out = sanitizeHtml('<p dir="rtl" lang="ar">مرحبا بكم في مدرسة النور</p>');
    expect(out).toContain('dir="rtl"');
    expect(out).toContain('lang="ar"');
    expect(out).toContain('مرحبا بكم في مدرسة النور');
  });

  it('keeps Arabic text content and allowed formatting tags intact', () => {
    const out = sanitizeHtml('<p><strong>عاجل:</strong> اجتماع أولياء الأمور يوم الأحد</p>');
    expect(out).toContain('<strong>عاجل:</strong>');
    expect(out).toContain('اجتماع أولياء الأمور يوم الأحد');
  });

  it('preserves special Arabic characters and diacritics', () => {
    const arabicWithDiacritics = 'الطَّالِبُ المُجْتَهِدُ';
    const out = sanitizeHtml(`<span dir="rtl">${arabicWithDiacritics}</span>`);
    expect(out).toContain(arabicWithDiacritics);
    expect(out).toContain('dir="rtl"');
  });

  it('handles mixed LTR/RTL content (English + Arabic in one block)', () => {
    const out = sanitizeHtml('<div><span lang="en">Invoice</span> <span lang="ar" dir="rtl">فاتورة</span></div>');
    expect(out).toContain('lang="en"');
    expect(out).toContain('lang="ar"');
    expect(out).toContain('فاتورة');
  });
});
