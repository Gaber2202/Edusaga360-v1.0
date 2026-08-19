import { describe, it, expect } from 'vitest';
import { buildAttendanceReportHtml } from '../lib/attendanceReport';

describe('buildAttendanceReportHtml', () => {
  it('escapes notes so markup cannot break the report', () => {
    const html = buildAttendanceReportHtml({
      title: 'Attendance report',
      subtitle: 'Sara',
      generatedLabel: 'Generated: today',
      rateLabel: 'Attendance Rate',
      rate: '96%',
      columns: ['Date', 'Student', 'Status', 'Notes'],
      rows: [['2026-08-17', 'Sara', 'Present', '<img src=x onerror=alert(1)>']],
      meta: [{ label: 'Child', value: 'Sara' }],
      isRTL: false,
    });

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
  });
});
