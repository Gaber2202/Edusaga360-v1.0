import { getBrowser } from './zatca.js';

const ACCENT = '#0E6B4F';
const GREEN = '#16A077';
const AMBER = '#E0A82E';
const RED = '#D1493F';
const GOLD = '#C8A451';
const INK = '#1C2420';

function fmtSAR(n: number): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `SAR ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n}%`;
}

function badge(cls: string, text: string): string {
  return `<span class="badge ${cls}">${text}</span>`;
}

function barChartSVG(data: { label: string; value: number }[], color = ACCENT, width = 560, height = 180): string {
  if (!data.length) return '<p>No chart data.</p>';
  const max = Math.max(...data.map((d) => Math.abs(d.value || 0)), 1);
  const barW = Math.max(20, (width - 60) / data.length - 10);
  const chartH = height - 50;
  const bars = data
    .map((d, i) => {
      const h = (Math.abs(d.value || 0) / max) * chartH;
      const y = chartH - h + 20;
      const x = 30 + i * (barW + 10);
      const label = d.label.length > 8 ? d.label.slice(0, 6) + '…' : d.label;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${color}" rx="3" />
              <text x="${x + barW / 2}" y="${chartH + 35}" text-anchor="middle" font-size="10" fill="#666">${label}</text>`;
    })
    .join('');
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}

function section(title: string, content: string, isRTL = false): string {
  return `<div class="section"><h2>${title}</h2>${content}</div>`;
}

function table(headers: string[], rows: string[][]): string {
  const head = headers.map((h) => `<th>${h}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function kpiCards(pairs: [string, string, string?][]): string {
  return `<div class="kpi-row">${pairs.map(([label, value, sub]) => `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`).join('')}</div>`;
}

function buildBaseHtml(body: string, title: string, isRTL: boolean): string {
  const dir = isRTL ? 'rtl' : 'ltr';
  return `<!DOCTYPE html>
<html dir="${dir}" lang="${isRTL ? 'ar' : 'en'}">
<head>
<meta charset="utf-8">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Noto+Naskh+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  body { font-family: 'IBM Plex Sans Arabic', 'Noto Naskh Arabic', sans-serif; margin: 24px; color: ${INK}; font-size: 12px; }
  h1 { color: ${ACCENT}; font-size: 20px; margin-bottom: 4px; }
  .subtitle { color: #666; margin-bottom: 16px; }
  h2 { color: ${ACCENT}; font-size: 14px; margin: 20px 0 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
  .kpi-row { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0; }
  .kpi { border: 1px solid #eee; border-radius: 8px; padding: 12px; min-width: 140px; }
  .kpi-label { font-size: 10px; color: #666; margin-bottom: 4px; }
  .kpi-value { font-size: 18px; font-weight: 700; }
  .kpi-sub { font-size: 10px; color: #888; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #eee; padding: 6px 8px; text-align: ${isRTL ? 'right' : 'left'}; font-size: 11px; }
  th { background: #f7f7f7; }
  .badge { padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; display: inline-block; }
  .green { background: #d1fae5; color: #047857; }
  .amber { background: #fef3c7; color: #b45309; }
  .red { background: #fee2e2; color: #b91c1c; }
  .muted { background: #f3f4f6; color: #6b7280; }
  .section { page-break-inside: avoid; margin-bottom: 18px; }
  svg { max-width: 100%; height: auto; }
</style>
</head>
<body>${body}</body>
</html>`;
}

export interface ExportOptions {
  persona: 'ceo' | 'cfo' | 'coo' | 'chro';
  tenantName?: string;
  branchName?: string;
  period: string;
  isRTL: boolean;
  data: any;
  format: 'pdf' | 'png';
}

function trendTable(label: string, trend: any[], valueKeys: { key: string; label: string }[]): string {
  if (!trend || trend.length === 0) return '<p>No trend data.</p>';
  const rows = trend.map((t) => [t.label, ...valueKeys.map((k) => (typeof t[k.key] === 'number' ? fmtSAR(t[k.key]) : String(t[k.key] ?? '—'))) ]);
  return table([label, ...valueKeys.map((k) => k.label)], rows);
}

function renderCEO(data: any, isRTL: boolean): string {
  const v = data.vitality || {};
  const f = data.financials || {};
  const c = data.collections || {};
  const g = data.growth || {};
  const alerts = (data.strategic_alerts || []).slice(0, 5);
  const risks = (data.top_risks || []).slice(0, 5);
  const revChart = barChartSVG((data.revenue_trend || []).map((t: any) => ({ label: t.label, value: t.revenue || 0 })), ACCENT);
  const collChart = barChartSVG((data.collection_trend || []).map((t: any) => ({ label: t.label, value: t.rate || 0 })), GOLD);
  const campusRows = (data.campus_vitality || []).map((c: any) => [
    isRTL ? c.name_ar : c.name_en,
    String(c.score ?? '—'),
    fmtPct(c.utilization_pct),
    fmtSAR(c.cash_collected),
  ]);
  return [
    kpiCards([
      [isRTL ? 'مؤشر الحيوية' : 'Vitality Score', String(v.score ?? '—')],
      [isRTL ? 'الإيرادات' : 'Revenue', fmtSAR(f.revenue)],
      [isRTL ? 'الأرباح' : 'EBITDA', fmtSAR(f.ebitda)],
      [isRTL ? 'نسبة التحصيل' : 'Collection Rate', fmtPct(c.collection_rate_pct), c.collection_rate_note || ''],
      [isRTL ? 'معدل النمو' : 'Growth', fmtPct(g.growth_rate), (g.data_quality !== 'real' ? 'estimated' : '')],
    ]),
    section(isRTL ? 'اتجاه الإيرادات' : 'Revenue Trend', revChart, isRTL),
    section(isRTL ? 'اتجاه نسبة التحصيل' : 'Collection Trend', collChart, isRTL),
    section(isRTL ? 'حيوية الفروع' : 'Branch Vitality', table([isRTL ? 'الفرع' : 'Campus', isRTL ? 'الدرجة' : 'Score', isRTL ? 'الاستغلال' : 'Utilization', isRTL ? 'النقد' : 'Cash'], campusRows), isRTL),
    section(isRTL ? 'أعلى 5 مخاطر' : 'Top 5 Risks', `<ul>${risks.map((r: any) => `<li>${isRTL ? r.message_ar : r.message_en}</li>`).join('')}</ul>`, isRTL),
    section(isRTL ? 'التنبيهات الاستراتيجية' : 'Strategic Alerts', alerts.length ? `<ul>${alerts.map((a: any) => `<li>${isRTL ? a.message_ar : a.message_en}</li>`).join('')}</ul>` : '<p>None</p>', isRTL),
  ].join('');
}

function renderCFO(data: any, isRTL: boolean): string {
  const k = data.kpis || {};
  const aging = data.ar_aging || {};
  const overdue = data.overdue_by_campus || [];
  const vat = data.vat_position || {};
  const agingRows = [
    ['0-30', fmtSAR(aging['0_30'] || 0)],
    ['31-60', fmtSAR(aging['31_60'] || 0)],
    ['61-90', fmtSAR(aging['61_90'] || 0)],
    ['90+', fmtSAR(aging['90_plus'] || 0)],
  ];
  const overdueRows = overdue.map((c: any) => [isRTL ? c.name_ar : c.name_en, fmtSAR(c.overdue_amount)]);
  const revEbitdaChart = barChartSVG((data.revenue_vs_ebitda || []).map((t: any) => ({ label: t.label, value: t.revenue || 0 })), ACCENT);
  return [
    kpiCards([
      [isRTL ? 'الإيرادات' : 'Revenue', fmtSAR(k.revenue)],
      [isRTL ? 'الأرباح' : 'EBITDA', fmtSAR(k.ebitda)],
      [isRTL ? 'الهامش' : 'Margin', fmtPct(k.margin_pct)],
      [isRTL ? 'النقد المحصل (30 يوم)' : 'Cash Collected (30d)', fmtSAR(k.cash_collected_30d)],
      [isRTL ? 'DSO' : 'DSO Days', String(k.dso_days ?? '—')],
    ]),
    section(isRTL ? 'الإيرادات مقابل الأرباح (6 أشهر)' : 'Revenue vs EBITDA', revEbitdaChart, isRTL),
    section(isRTL ? 'أعمار الذمم المدينة' : 'AR Aging', table([isRTL ? 'الفترة' : 'Bucket', isRTL ? 'المبلغ' : 'Amount'], agingRows), isRTL),
    section(isRTL ? 'المتأخرات حسب الفرع' : 'Overdue by Campus', overdueRows.length ? table([isRTL ? 'الفرع' : 'Campus', isRTL ? 'المبلغ' : 'Amount'], overdueRows) : '<p>No overdue data.</p>', isRTL),
    section(isRTL ? 'موقف ضريبة القيمة المضافة' : 'VAT Position', `<p>${isRTL ? 'ضريبة القيمة المضافة المستحقة' : 'Output VAT accrued'}: <strong>${fmtSAR(vat.output_vat_accrued)}</strong><br>${isRTL ? 'تاريخ التقديم التالي' : 'Next filing date'}: ${vat.next_filing_date || '—'}</p>`, isRTL),
  ].join('');
}

function renderCOO(data: any, isRTL: boolean): string {
  const k = data.kpis || {};
  const capacity = data.capacity_to_cash || [];
  const funnel = data.admissions_funnel || {};
  const util = data.utilization_by_campus || [];
  const funnelRows = (funnel.applications_by_stage || []).map((s: any) => [s.stage, String(s.count)]);
  const capRows = capacity.map((c: any) => [isRTL ? c.name_ar : c.name_en, String(c.capacity), String(c.enrolled), fmtPct(c.utilization_pct), fmtSAR(c.cash_collected)]);
  const utilRows = util.map((c: any) => [isRTL ? c.name_ar : c.name_en, fmtPct(c.utilization_pct)]);
  return [
    kpiCards([
      [isRTL ? 'استغلال السعة' : 'Capacity Utilization', fmtPct(k.capacity_utilization_pct)],
      [isRTL ? 'نسبة الطلاب للمعلمين' : 'Student:Teacher Ratio', String(k.student_teacher_ratio ?? '—')],
    ]),
    section(isRTL ? 'السعة إلى النقد' : 'Capacity to Cash', table([isRTL ? 'الفرع' : 'Campus', isRTL ? 'السعة' : 'Capacity', isRTL ? 'المسجلون' : 'Enrolled', isRTL ? 'الاستغلال' : 'Utilization', isRTL ? 'النقد' : 'Cash'], capRows), isRTL),
    section(isRTL ? 'قمع القبول' : 'Admissions Funnel', funnelRows.length ? table([isRTL ? 'المرحلة' : 'Stage', isRTL ? 'العدد' : 'Count'], funnelRows) : '<p>No funnel data.</p>', isRTL),
    section(isRTL ? 'الاستغلال حسب الفرع' : 'Utilization by Campus', utilRows.length ? table([isRTL ? 'الفرع' : 'Campus', isRTL ? 'الاستغلال' : 'Utilization'], utilRows) : '<p>No data.</p>', isRTL),
  ].join('');
}

function renderCHRO(data: any, isRTL: boolean): string {
  const k = data.kpis || {};
  const n = data.nitaqat || {};
  const wc = data.workforce_composition || {};
  const ce = data.contract_expiry_radar || {};
  const la = data.leave_absence_summary || {};
  const comp = data.payroll_gov_compliance || {};
  const bandMap: Record<string, string> = { platinum: 'green', green: 'green', yellow: 'amber', red: 'red' };
  const band = n.band ? badge(bandMap[String(n.band)] || 'muted', String(n.band).toUpperCase()) : '—';
  const deptRows = (wc.by_department || []).map((d: any) => [isRTL ? d.name_ar : d.name_en, String(d.count)]);
  return [
    kpiCards([
      [isRTL ? 'إجمالي الموظفين' : 'Headcount', String(k.headcount ?? '—')],
      [isRTL ? 'نسبة التوطين' : 'Saudization', fmtPct(k.saudization_pct)],
      [isRTL ? 'معدل الاستبقاء' : 'Retention', fmtPct(k.retention_rate_pct)],
      [isRTL ? 'فئة نطاقات' : 'Nitaqat Band', band],
    ]),
    section(isRTL ? 'التكوين حسب القسم' : 'Composition by Department', deptRows.length ? table([isRTL ? 'القسم' : 'Department', isRTL ? 'العدد' : 'Count'], deptRows) : '<p>No department data.</p>', isRTL),
    section(isRTL ? 'عقود تنتهي قريباً' : 'Contract Expiry Radar', `<div class="kpi-row"><div class="kpi"><div class="kpi-label">0-30 ${isRTL ? 'يوم' : 'days'}</div><div class="kpi-value">${ce['0_30'] || 0}</div></div><div class="kpi"><div class="kpi-label">31-60 ${isRTL ? 'يوم' : 'days'}</div><div class="kpi-value">${ce['31_60'] || 0}</div></div><div class="kpi"><div class="kpi-label">61-90 ${isRTL ? 'يوم' : 'days'}</div><div class="kpi-value">${ce['61_90'] || 0}</div></div></div>`, isRTL),
    section(isRTL ? 'ملخص الغياب والإجازات (30 يوماً)' : 'Leave & Absence (30d)', `<div class="kpi-row"><div class="kpi"><div class="kpi-label">${isRTL ? 'غياب' : 'Absent'}</div><div class="kpi-value">${la.absent || 0}</div></div><div class="kpi"><div class="kpi-label">${isRTL ? 'تأخر' : 'Late'}</div><div class="kpi-value">${la.late || 0}</div></div><div class="kpi"><div class="kpi-label">${isRTL ? 'معذور' : 'Excused'}</div><div class="kpi-value">${la.excused || 0}</div></div></div>`, isRTL),
    section(isRTL ? 'الالتزام الحكومي' : 'Government Compliance', `<p>ZATCA/VAT: ${comp.zatca_vat?.status || '—'}<br>WPS/Mudad: ${comp.wps_mudad?.status || '—'}<br>GOSI: ${comp.gosi?.status || '—'}<br>Qiwa: ${comp.qiwa?.status || '—'}</p>`, isRTL),
  ].join('');
}

export async function renderDashboardExport(opts: ExportOptions): Promise<Buffer> {
  const { persona, tenantName, branchName, period, isRTL, data, format } = opts;
  let body = '';
  if (persona === 'ceo') body = renderCEO(data, isRTL);
  else if (persona === 'cfo') body = renderCFO(data, isRTL);
  else if (persona === 'coo') body = renderCOO(data, isRTL);
  else if (persona === 'chro') body = renderCHRO(data, isRTL);
  else body = '<p>Unknown persona.</p>';

  const title = `EduSaga 360 — ${persona.toUpperCase()} Dashboard`;
  const subtitle = `${tenantName || ''} · ${branchName || (isRTL ? 'جميع الفروع' : 'All branches')} · ${period}`;
  const header = `<h1>${title}</h1><div class="subtitle">${subtitle} · ${new Date().toLocaleString(isRTL ? 'ar-SA' : 'en-US')}</div>`;
  const html = buildBaseHtml(header + body, title, isRTL);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    if (format === 'png') {
      const element = await page.$('body');
      const screenshot = await element!.screenshot({ type: 'png' });
      return Buffer.from(screenshot);
    }
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' } });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
