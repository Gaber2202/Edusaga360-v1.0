import { describe, it, expect } from 'vitest';
import { buildReportPrintHtml, escapeHtml } from '../lib/reportPrint';

describe('escapeHtml', () => {
  it('escapes HTML-significant characters', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('buildReportPrintHtml (P3.4 print-ready output)', () => {
  const base = {
    title: 'Fee Collection',
    meta: 'Generated: 2026-06-20 • 2 records',
    headers: ['Student', 'Amount'],
    rows: [['Ali', '1,150'], ['Sara', '900']],
  };

  it('renders LTR by default and RTL when isRTL', () => {
    expect(buildReportPrintHtml({ ...base, isRTL: false })).toContain('dir="ltr"');
    const rtl = buildReportPrintHtml({ ...base, isRTL: true });
    expect(rtl).toContain('dir="rtl"');
    expect(rtl).toContain('lang="ar"');
    expect(rtl).toContain('text-align: right');
  });

  it('includes the title, meta, headers and row cells', () => {
    const html = buildReportPrintHtml(base);
    expect(html).toContain('Fee Collection');
    expect(html).toContain('2 records');
    expect(html).toContain('<th>Student</th>');
    expect(html).toContain('<td>Ali</td>');
    expect(html).toContain('<td>1,150</td>');
  });

  it('escapes malicious cell content (no raw script injection)', () => {
    const html = buildReportPrintHtml({ ...base, rows: [['<img src=x onerror=alert(1)>', 'x']] });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('triggers print on load', () => {
    expect(buildReportPrintHtml(base)).toContain('window.print()');
  });
});
