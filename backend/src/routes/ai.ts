import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { sanitizeSearchTerm } from '../lib/sanitize.js';

export const aiRouter = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Model config ─────────────────────────────────────────────────────────────
// Yamen's brain is PLUGGABLE. Built-in providers (Gemini, Claude, Groq, OpenAI)
// are auto-detected in priority order, joined by any number of CUSTOM
// OpenAI-compatible endpoints declared via AI_CUSTOM_PROVIDERS. That means a
// deployment can add / remove / swap the LLM — including pointing Yamen at a
// local or regional model (e.g. a KSA-hosted LLM) — purely through environment
// configuration, with no code change. Pin one with AI_PROVIDER, or set an
// explicit failover chain with AI_PROVIDER_ORDER. Env is read per-request so
// changes take effect without a redeploy. Every provider supports full tool use
// (live school-data queries).

function getGeminiKey() {
  return process.env.GOOGLE_AI_API_KEY
    || process.env.GEMINI_API_KEY
    || process.env.Gemini_EduSaga360
    || '';
}
function getGeminiModel() { return process.env.GOOGLE_AI_MODEL || 'gemini-2.0-flash'; }
function getClaudeKey()  { return process.env.ANTHROPIC_API_KEY || ''; }
const CLAUDE_MODEL = 'claude-sonnet-4-6';

// OpenAI-compatible providers (Groq, OpenAI, OpenRouter, Together, DeepSeek, …)
// all speak the same chat-completions + tool-calling format, so one code path
// serves them. Model and base URL have sane defaults but are overridable.
interface OpenAICompatConfig { name: string; apiKey: string; baseUrl: string; model: string }

function getGroqKey()   { return process.env.GROQ_API_KEY || ''; }
function getOpenAIKey() { return process.env.OPENAI_API_KEY || ''; }

export function getGroqConfig(): OpenAICompatConfig | null {
  const apiKey = getGroqKey();
  if (!apiKey) return null;
  return {
    name: 'groq',
    apiKey,
    baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    model:   process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  };
}
export function getOpenAIConfig(): OpenAICompatConfig | null {
  const apiKey = getOpenAIKey();
  if (!apiKey) return null;
  return {
    name: 'openai',
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model:   process.env.OPENAI_MODEL || 'gpt-4o-mini',
  };
}

// ─── Provider registry (config-driven) ───────────────────────────────────────
// A provider is described by a ProviderDef. The registry is assembled per
// request from (a) the four built-ins and (b) custom endpoints parsed from
// AI_CUSTOM_PROVIDERS, so "add / remove / change the LLM" is a configuration
// change, never a code change.

type ProviderFormat = 'gemini' | 'anthropic' | 'openai';

interface ProviderDef {
  name: string;
  format: ProviderFormat; // wire protocol used to talk to the model
  model: string;
  apiKey: string;         // '' is allowed for keyless local endpoints (openai format)
  baseUrl?: string;       // openai format only
  keyEnvVar: string;      // env var that supplies the key (for diagnostics/messages)
  configured: boolean;    // usable right now
  custom: boolean;        // declared via AI_CUSTOM_PROVIDERS
}

const BUILTIN_PROVIDER_NAMES = ['gemini', 'claude', 'groq', 'openai'] as const;

/** The four built-in providers, in default priority order. */
function builtinProviderDefs(): ProviderDef[] {
  const groq = getGroqConfig();
  const openai = getOpenAIConfig();
  return [
    { name: 'gemini', format: 'gemini', model: getGeminiModel(), apiKey: getGeminiKey(), keyEnvVar: 'GOOGLE_AI_API_KEY', configured: !!getGeminiKey(), custom: false },
    { name: 'claude', format: 'anthropic', model: CLAUDE_MODEL, apiKey: getClaudeKey(), keyEnvVar: 'ANTHROPIC_API_KEY', configured: !!getClaudeKey(), custom: false },
    { name: 'groq', format: 'openai', model: groq?.model ?? 'llama-3.3-70b-versatile', apiKey: getGroqKey(), baseUrl: groq?.baseUrl ?? 'https://api.groq.com/openai/v1', keyEnvVar: 'GROQ_API_KEY', configured: !!getGroqKey(), custom: false },
    { name: 'openai', format: 'openai', model: openai?.model ?? 'gpt-4o-mini', apiKey: getOpenAIKey(), baseUrl: openai?.baseUrl ?? 'https://api.openai.com/v1', keyEnvVar: 'OPENAI_API_KEY', configured: !!getOpenAIKey(), custom: false },
  ];
}

interface CustomProviderConfig {
  name?: string;
  base_url?: string; baseUrl?: string;
  model?: string;
  api_key?: string; apiKey?: string;
  api_key_env?: string; apiKeyEnv?: string;
  format?: string;
}

/**
 * Parse AI_CUSTOM_PROVIDERS — a JSON array of OpenAI-compatible (by default)
 * endpoints. Example (a KSA-hosted local model):
 *   AI_CUSTOM_PROVIDERS='[{"name":"ksa-local","base_url":"https://llm.example.sa/v1","model":"jais-30b","api_key_env":"KSA_LLM_KEY"}]'
 * A local endpoint may be keyless — omit api_key/api_key_env and it is treated
 * as configured. Reserved built-in names are ignored.
 */
function parseCustomProviders(): ProviderDef[] {
  const raw = (process.env.AI_CUSTOM_PROVIDERS || '').trim();
  if (!raw) return [];
  let arr: CustomProviderConfig[];
  try {
    const parsed = JSON.parse(raw);
    arr = Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn('[ai] AI_CUSTOM_PROVIDERS is not valid JSON — ignoring');
    return [];
  }
  const reserved = new Set<string>(BUILTIN_PROVIDER_NAMES);
  const defs: ProviderDef[] = [];
  for (const c of arr) {
    const name = (c.name || '').trim().toLowerCase();
    const baseUrl = (c.baseUrl || c.base_url || '').trim();
    const model = (c.model || '').trim();
    if (!name || reserved.has(name)) { console.warn(`[ai] custom provider "${c.name ?? ''}" skipped (missing or reserved name)`); continue; }
    if (!baseUrl || !model) { console.warn(`[ai] custom provider "${name}" skipped (base_url and model are required)`); continue; }
    const keyEnv = (c.apiKeyEnv || c.api_key_env || '').trim();
    const apiKey = keyEnv ? (process.env[keyEnv] || '') : (c.apiKey || c.api_key || '');
    const format: ProviderFormat = c.format === 'gemini' || c.format === 'anthropic' ? c.format : 'openai';
    defs.push({
      name,
      format,
      model,
      apiKey,
      baseUrl,
      keyEnvVar: keyEnv || 'AI_CUSTOM_PROVIDERS',
      // Only require a key when the config declared where to find one; local
      // endpoints are frequently keyless.
      configured: keyEnv ? !!apiKey : true,
      custom: true,
    });
  }
  return defs;
}

/** Full registry: built-ins first (priority order), then customs as declared. */
function allProviderDefs(): ProviderDef[] {
  return [...builtinProviderDefs(), ...parseCustomProviders()];
}

function findProviderDef(name: string): ProviderDef | undefined {
  const key = name.trim().toLowerCase();
  return allProviderDefs().find((d) => d.name === key);
}

/** Every provider name the platform currently knows about (for messages). */
function knownProviderNames(): string[] {
  return allProviderDefs().map((d) => d.name);
}

function isKnownProvider(name: string): boolean {
  return !!findProviderDef(name);
}

// Optional explicit provider override — set AI_PROVIDER=groq (or a custom name)
// to pin a single provider. When unset, providers are auto-detected.
function getForcedProvider() { return (process.env.AI_PROVIDER || '').trim().toLowerCase(); }

// Optional failover chain, e.g. AI_PROVIDER_ORDER="ksa-local,openai,groq".
// Takes effect only when AI_PROVIDER is not pinned.
function getProviderOrder(): string[] {
  return (process.env.AI_PROVIDER_ORDER || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function providerConfigured(name: string): boolean {
  return findProviderDef(name)?.configured ?? false;
}

function envVarFor(name: string): string {
  return findProviderDef(name)?.keyEnvVar ?? 'AI_PROVIDER';
}

/** Ordered provider DEFS to attempt for a request (honours AI_PROVIDER / _ORDER). */
function orderedProviderDefs(): ProviderDef[] {
  const all = allProviderDefs();
  const byName = (n: string) => all.find((d) => d.name === n);
  const forced = getForcedProvider();
  if (forced) { const d = byName(forced); return d ? [d] : []; }
  const explicit = getProviderOrder();
  if (explicit.length) return explicit.map(byName).filter((d): d is ProviderDef => !!d);
  return all; // default: built-ins in priority order, then customs
}

// The provider that will actually serve a request (honours AI_PROVIDER), or
// 'none' / a "(key missing)" marker for diagnostics.
function activeProviderName(): string {
  const forced = getForcedProvider();
  if (forced) return providerConfigured(forced) ? forced : `${forced} (key missing)`;
  return orderedProviderDefs().find((d) => d.configured)?.name ?? 'none';
}

// ─── Tool definitions (Claude tool_use format) ───────────────────────────────

const TOOLS = [
  {
    name: 'get_employee_list',
    description: 'Get a list of employees for this school, with optional filters. Use to answer questions about headcount, departments, nationalities.',
    input_schema: {
      type: 'object',
      properties: {
        status:     { type: 'string', enum: ['active', 'inactive', 'all'], description: 'Filter by employment status' },
        department: { type: 'string', description: 'Filter by department name (partial match)' },
        limit:      { type: 'number', description: 'Max records to return (default 50)' },
      },
    },
  },
  {
    name: 'get_payroll_summary',
    description: 'Get payroll totals, gross/net salaries, GOSI contributions for a specific period or the most recent month.',
    input_schema: {
      type: 'object',
      properties: {
        period_start: { type: 'string', description: 'YYYY-MM-DD start date (defaults to current month start)' },
        period_end:   { type: 'string', description: 'YYYY-MM-DD end date (defaults to current month end)' },
      },
    },
  },
  {
    name: 'get_attendance_summary',
    description: 'Get employee attendance statistics: present/absent/late counts for a date range.',
    input_schema: {
      type: 'object',
      properties: {
        from:        { type: 'string', description: 'YYYY-MM-DD start date' },
        to:          { type: 'string', description: 'YYYY-MM-DD end date' },
        employee_id: { type: 'string', description: 'Optional: filter to a single employee UUID' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_leave_summary',
    description: 'Get pending leave requests, approved leaves, and leave balance totals.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'all'], description: 'Filter by status' },
        from:   { type: 'string', description: 'YYYY-MM-DD filter by start_date' },
        to:     { type: 'string', description: 'YYYY-MM-DD filter by end_date' },
      },
    },
  },
  {
    name: 'get_fee_collection_stats',
    description: 'Get student fee collection status: total invoiced, collected, outstanding, overdue count.',
    input_schema: {
      type: 'object',
      properties: {
        academic_year: { type: 'string', description: 'Filter by academic year label (e.g. "2025-2026")' },
      },
    },
  },
  {
    name: 'get_compliance_alerts',
    description: 'Get active compliance issues: expiring iqamas, GOSI mismatches, WPS outstanding, overdue invoices.',
    input_schema: {
      type: 'object',
      properties: {
        days_ahead: { type: 'number', description: 'Number of days ahead to check expiry (default 30)' },
      },
    },
  },
  {
    name: 'search_employee',
    description: 'Search for a specific employee by name (Arabic or English) or employee number.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name or employee number to search' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_student_stats',
    description: 'Get student enrollment counts by grade, branch, gender, or nationality.',
    input_schema: {
      type: 'object',
      properties: {
        group_by: { type: 'string', enum: ['grade', 'branch', 'gender', 'nationality'], description: 'Dimension to group by' },
      },
    },
  },
] as const;

// ─── Tool executors — run against Supabase ────────────────────────────────────

async function runTool(name: string, input: Record<string, unknown>, tenantId: string): Promise<unknown> {
  switch (name) {

    case 'get_employee_list': {
      const status = (input.status as string) ?? 'active';
      const limit  = Math.min(Number(input.limit ?? 50), 200);
      let q = supabase
        .from('employees')
        .select('id, employee_number, name_en, name_ar, job_title_name, department_name, nationality, status, hire_date, basic_salary')
        .eq('tenant_id', tenantId)
        .limit(limit);
      if (status !== 'all') q = q.eq('status', status);
      if (input.department) q = q.ilike('department_name', `%${input.department}%`);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return {
        total: data?.length ?? 0,
        employees: data ?? [],
        note: (data?.length ?? 0) === limit ? `Showing first ${limit} results` : undefined,
      };
    }

    case 'get_payroll_summary': {
      const now    = new Date();
      const pStart = (input.period_start as string) ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const pEnd   = (input.period_end   as string) ?? now.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('payslip_lines')
        .select('employee_id, basic_salary, gross_salary, net_salary, gosi_employee, gosi_employer, total_deductions')
        .eq('tenant_id', tenantId)
        .gte('created_at', pStart)
        .lte('created_at', pEnd + 'T23:59:59Z');
      if (error) return { error: error.message };
      const rows = (data ?? []) as any[];
      const sum  = (key: string) => Math.round(rows.reduce((s: number, r: any) => s + Number(r[key] ?? 0), 0) * 100) / 100;
      return {
        period_start:      pStart,
        period_end:        pEnd,
        employee_count:    rows.length,
        total_gross:       sum('gross_salary'),
        total_net:         sum('net_salary'),
        total_gosi_employee: sum('gosi_employee'),
        total_gosi_employer: sum('gosi_employer'),
        total_deductions:  sum('total_deductions'),
      };
    }

    case 'get_attendance_summary': {
      const { data, error } = await supabase
        .from('employee_attendance')
        .select('employee_id, status, late_minutes, is_excused, date')
        .eq('tenant_id', tenantId)
        .gte('date', input.from as string)
        .lte('date', input.to as string);
      if (error) return { error: error.message };
      const rows = (data ?? []) as any[];
      if (input.employee_id) {
        const emp = rows.filter((r: any) => r.employee_id === input.employee_id);
        return {
          employee_id: input.employee_id,
          from: input.from, to: input.to,
          total:   emp.length,
          present: emp.filter((r: any) => r.status === 'present').length,
          absent:  emp.filter((r: any) => r.status === 'absent').length,
          late:    emp.filter((r: any) => r.status === 'late').length,
          half_day: emp.filter((r: any) => r.status === 'half_day').length,
          leave:   emp.filter((r: any) => r.status === 'leave').length,
        };
      }
      const byStatus = rows.reduce((acc: Record<string, number>, r: any) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {});
      const uniqueEmp = new Set(rows.map((r: any) => r.employee_id)).size;
      return { from: input.from, to: input.to, employee_count: uniqueEmp, by_status: byStatus, total_records: rows.length };
    }

    case 'get_leave_summary': {
      const status = (input.status as string) ?? 'all';
      let q = supabase
        .from('leave_requests')
        .select('id, employee_id, days, status, start_date, end_date, leave_type_id, leave_types(name)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (status !== 'all') q = q.eq('status', status);
      if (input.from) q = q.gte('start_date', input.from as string);
      if (input.to)   q = q.lte('end_date',   input.to   as string);
      const { data, error } = await q;
      if (error) return { error: error.message };
      const rows = (data ?? []) as any[];
      const byStatus = rows.reduce((acc: Record<string, number>, r: any) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {});
      const totalDays = rows.reduce((s: number, r: any) => s + (r.days ?? 0), 0);
      return { total_requests: rows.length, total_days: totalDays, by_status: byStatus, requests: rows.slice(0, 20) };
    }

    case 'get_fee_collection_stats': {
      let q = supabase
        .from('invoices')
        .select('id, total_amount, paid_amount, status, due_date')
        .eq('tenant_id', tenantId);
      if (input.academic_year) q = q.eq('academic_year', input.academic_year as string);
      const { data, error } = await q;
      if (error) return { error: error.message };
      const rows = (data ?? []) as any[];
      const sum  = (key: string) => Math.round(rows.reduce((s: number, r: any) => s + Number(r[key] ?? 0), 0) * 100) / 100;
      const today = new Date().toISOString().slice(0, 10);
      const overdue = rows.filter((r: any) => r.status !== 'paid' && r.due_date && r.due_date < today).length;
      return {
        total_invoices: rows.length,
        total_invoiced:    sum('total_amount'),
        total_collected:   sum('paid_amount'),
        total_outstanding: Math.round((sum('total_amount') - sum('paid_amount')) * 100) / 100,
        paid_count:        rows.filter((r: any) => r.status === 'paid').length,
        partial_count:     rows.filter((r: any) => r.status === 'partial').length,
        pending_count:     rows.filter((r: any) => r.status === 'pending').length,
        overdue_count:     overdue,
        collection_rate:   rows.length > 0 ? `${Math.round(rows.filter((r: any) => r.status === 'paid').length / rows.length * 100)}%` : '0%',
      };
    }

    case 'get_compliance_alerts': {
      const daysAhead = Number(input.days_ahead ?? 30);
      const today     = new Date();
      const cutoff    = new Date(today.getTime() + daysAhead * 86400000).toISOString().slice(0, 10);
      const todayStr  = today.toISOString().slice(0, 10);

      const [iqamaRes, leaveRes, invoiceRes] = await Promise.all([
        // Iqama expiry
        supabase.from('employees')
          .select('id, name_en, name_ar, employee_number, iqama_expiry, nationality')
          .eq('tenant_id', tenantId).eq('status', 'active')
          .lte('iqama_expiry', cutoff).not('iqama_expiry', 'is', null),
        // Long-pending leave requests
        supabase.from('leave_requests')
          .select('id, employee_id, start_date, days, status, created_at')
          .eq('tenant_id', tenantId).eq('status', 'pending')
          .lte('created_at', new Date(today.getTime() - 5 * 86400000).toISOString()),
        // Overdue invoices
        supabase.from('invoices')
          .select('id, invoice_number, total_amount, paid_amount, due_date, student_id')
          .eq('tenant_id', tenantId).neq('status', 'paid')
          .lte('due_date', todayStr).not('due_date', 'is', null),
      ]);

      const iqamaExpiring  = (iqamaRes.data  ?? []) as any[];
      const pendingLeaves  = (leaveRes.data   ?? []) as any[];
      const overdueInvoices = (invoiceRes.data ?? []) as any[];

      const alerts: Array<{ severity: string; category: string; message: string; count?: number; items?: unknown[] }> = [];

      const expired  = iqamaExpiring.filter((e: any) => e.iqama_expiry < todayStr);
      const expiring = iqamaExpiring.filter((e: any) => e.iqama_expiry >= todayStr);
      if (expired.length  > 0) alerts.push({ severity: 'critical', category: 'iqama', message: `${expired.length} employee(s) have EXPIRED iqama`, items: expired.map((e: any) => ({ name: e.name_en ?? e.name_ar, expiry: e.iqama_expiry, id: e.employee_number })) });
      if (expiring.length > 0) alerts.push({ severity: 'warning',  category: 'iqama', message: `${expiring.length} iqama(s) expiring within ${daysAhead} days`, count: expiring.length });
      if (pendingLeaves.length > 0)  alerts.push({ severity: 'info',    category: 'leave',   message: `${pendingLeaves.length} leave request(s) pending for 5+ days` });
      if (overdueInvoices.length > 0) {
        const totalOverdue = overdueInvoices.reduce((s: number, i: any) => s + Number(i.total_amount ?? 0) - Number(i.paid_amount ?? 0), 0);
        alerts.push({ severity: 'warning', category: 'fees', message: `${overdueInvoices.length} overdue invoice(s) — SAR ${Math.round(totalOverdue).toLocaleString()} outstanding` });
      }
      if (alerts.length === 0) alerts.push({ severity: 'ok', category: 'general', message: 'No active compliance issues found' });

      return { checked_on: todayStr, days_ahead: daysAhead, alert_count: alerts.length, alerts };
    }

    case 'search_employee': {
      const query = sanitizeSearchTerm(String(input.query ?? ''));
      const { data, error } = await supabase
        .from('employees')
        .select('id, employee_number, name_en, name_ar, job_title_name, department_name, nationality, status, basic_salary, hire_date, iqama_expiry')
        .eq('tenant_id', tenantId)
        .or(`name_en.ilike.%${query}%,name_ar.ilike.%${query}%,employee_number.ilike.%${query}%`)
        .limit(10);
      if (error) return { error: error.message };
      return { found: (data ?? []).length, employees: data ?? [] };
    }

    case 'get_student_stats': {
      const groupBy = (input.group_by as string) ?? 'grade';
      const colMap: Record<string, string> = {
        grade:       'grade_level',
        branch:      'branch_id',
        gender:      'gender',
        nationality: 'nationality',
      };
      const col = colMap[groupBy] ?? 'grade_level';
      const { data, error } = await supabase
        .from('students')
        .select(`${col}, id`)
        .eq('tenant_id', tenantId)
        .eq('status', 'active');
      if (error) return { error: error.message };
      const rows = (data ?? []) as any[];
      const grouped = rows.reduce((acc: Record<string, number>, r: any) => {
        const key = r[col] ?? 'Unknown';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});
      return { total_students: rows.length, group_by: groupBy, breakdown: grouped };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Claude with tool use ─────────────────────────────────────────────────────

export interface Message { role: 'user' | 'assistant'; content: string | unknown[] }

export async function callClaudeWithTools(
  messages: Message[],
  tenantId: string,
  systemPrompt: string,
): Promise<string> {
  const claudeKey = getClaudeKey();
  if (!claudeKey) throw new Error('ANTHROPIC_API_KEY not set');

  let currentMessages = [...messages];

  // Agentic loop — Claude may call multiple tools in sequence
  for (let iter = 0; iter < 8; iter++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         claudeKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        max_tokens: 4096,
        system:     systemPrompt,
        tools:      TOOLS,
        messages:   currentMessages,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API error (${res.status}): ${err.slice(0, 300)}`);
    }

    const data = await res.json() as any;

    if (data.stop_reason === 'end_turn') {
      // Final text response
      const textBlock = data.content?.find((b: any) => b.type === 'text');
      return textBlock?.text ?? 'No response generated.';
    }

    if (data.stop_reason === 'tool_use') {
      // Execute all tool calls in this turn
      const toolUseBlocks = data.content.filter((b: any) => b.type === 'tool_use');
      const toolResults: unknown[] = [];

      for (const toolUse of toolUseBlocks) {
        const result = await runTool(toolUse.name, toolUse.input ?? {}, tenantId);
        toolResults.push({
          type:        'tool_result',
          tool_use_id: toolUse.id,
          content:     JSON.stringify(result),
        });
      }

      // Append assistant turn + tool results and continue loop
      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: data.content },
        { role: 'user',      content: toolResults },
      ];
      continue;
    }

    // Unexpected stop reason
    const textBlock = data.content?.find((b: any) => b.type === 'text');
    return textBlock?.text ?? 'Unexpected response format.';
  }

  return 'Reached maximum tool call iterations.';
}

// ─── Gemini with tool use (function calling) ─────────────────────────────────

function geminiToolDeclarations() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  }));
}

export async function callGeminiWithTools(
  messages: Message[],
  tenantId: string,
  systemPrompt: string,
): Promise<string> {
  const geminiKey = getGeminiKey();
  if (!geminiKey) throw new Error('GOOGLE_AI_API_KEY not set');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${getGeminiModel()}:generateContent?key=${geminiKey}`;

  // Convert our Message[] to Gemini contents format
  const contents: Array<{ role: string; parts: unknown[] }> = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: typeof m.content === 'string' ? [{ text: m.content }] : (m.content as unknown[]),
  }));

  for (let iter = 0; iter < 8; iter++) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools: [{ function_declarations: geminiToolDeclarations() }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${err.slice(0, 300)}`);
    }

    const data = await res.json() as any;
    const candidate = data.candidates?.[0];
    if (!candidate) return 'No response from Gemini.';

    const parts = candidate.content?.parts ?? [];

    // Check for function calls
    const fnCalls = parts.filter((p: any) => p.functionCall);
    if (fnCalls.length === 0) {
      // Final text response
      const textPart = parts.find((p: any) => p.text);
      return textPart?.text ?? 'No response generated.';
    }

    // Execute tool calls and feed results back
    const fnResponseParts: unknown[] = [];
    for (const part of fnCalls) {
      const { name, args } = part.functionCall;
      const result = await runTool(name, args ?? {}, tenantId);
      fnResponseParts.push({
        functionResponse: { name, response: result },
      });
    }

    // Append model turn (with function calls) + user turn (with results)
    contents.push({ role: 'model', parts });
    contents.push({ role: 'user', parts: fnResponseParts });
  }

  return 'Reached maximum tool call iterations.';
}

// ─── OpenAI-compatible providers with tool use (Groq, OpenAI, OpenRouter, …) ───

function openAIToolDeclarations() {
  return TOOLS.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

export async function callOpenAICompatibleWithTools(
  messages: Message[],
  tenantId: string,
  systemPrompt: string,
  cfg: OpenAICompatConfig,
): Promise<string> {
  // Build OpenAI-style message list (system + history).
  const oaMessages: any[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    })),
  ];

  // Agentic loop — the model may call tools in sequence before answering.
  for (let iter = 0; iter < 8; iter++) {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: oaMessages,
        tools: openAIToolDeclarations(),
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${cfg.name} API error (${res.status}): ${err.slice(0, 300)}`);
    }

    const data = await res.json() as any;
    const message = data.choices?.[0]?.message;
    if (!message) return 'No response generated.';

    const toolCalls = message.tool_calls as any[] | undefined;
    if (!toolCalls || toolCalls.length === 0) {
      return message.content ?? 'No response generated.';
    }

    // Execute tool calls and feed the results back.
    oaMessages.push(message);
    for (const tc of toolCalls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* leave empty */ }
      const result = await runTool(tc.function?.name, args, tenantId);
      oaMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }

  return 'Reached maximum tool call iterations.';
}

// ─── Live provider probe (diagnostics) ────────────────────────────────────────
// Minimal generateContent call to verify the Gemini key/model/region actually
// work. Returns Google's verbatim error (the key value is never included) so a
// failure such as an unsupported server region or an invalid key is immediately
// visible — without anyone needing to read the Railway logs.

async function probeGemini(): Promise<{ ok: boolean; status: number; error?: string }> {
  const key = getGeminiKey();
  if (!key) return { ok: false, status: 0, error: 'no Gemini key detected' };
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${getGeminiModel()}:generateContent?key=${key}`;
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 1 },
      }),
    });
    if (!r.ok) return { ok: false, status: r.status, error: (await r.text()).slice(0, 500) };
    return { ok: true, status: r.status };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

// Minimal chat-completions call to verify an OpenAI-compatible key/model/endpoint.
async function probeOpenAICompatible(cfg: OpenAICompatConfig): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const r = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
    });
    if (!r.ok) return { ok: false, status: r.status, error: (await r.text()).slice(0, 500) };
    return { ok: true, status: r.status };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

// Probe whichever provider would actually serve a request.
async function probeActiveProvider(): Promise<Record<string, unknown>> {
  const forced = getForcedProvider();
  const provider = forced || orderedProviderDefs().find((d) => d.configured)?.name;
  if (!provider) return { skipped: true, reason: 'no provider configured' };
  const def = findProviderDef(provider);
  if (!def || !def.configured) {
    return { provider, skipped: true, reason: `${envVarFor(provider)} not set` };
  }
  if (def.format === 'gemini') return { provider, ...(await probeGemini()) };
  if (def.format === 'anthropic') return { provider, skipped: true, reason: 'no lightweight probe; sent on first chat' };
  const cfg: OpenAICompatConfig = {
    name: def.name,
    apiKey: def.apiKey,
    baseUrl: def.baseUrl ?? 'https://api.openai.com/v1',
    model: def.model,
  };
  return { provider, ...(await probeOpenAICompatible(cfg)) };
}

// ─── Provider resolution ──────────────────────────────────────────────────────
// Ordered list of providers to attempt for a request, honouring AI_PROVIDER.

export interface ProviderRunner { name: string; run: () => Promise<string> }

/** Map a provider def to a runnable, choosing the adapter by wire format. */
function runnerForDef(def: ProviderDef, messages: Message[], tenantId: string): ProviderRunner {
  if (def.format === 'gemini') {
    return { name: def.name, run: () => callGeminiWithTools(messages, tenantId, SYSTEM_PROMPT) };
  }
  if (def.format === 'anthropic') {
    return { name: def.name, run: () => callClaudeWithTools(messages, tenantId, SYSTEM_PROMPT) };
  }
  // openai-compatible: OpenAI, Groq, Azure, and any custom local/regional model.
  const cfg: OpenAICompatConfig = {
    name: def.name,
    apiKey: def.apiKey,
    baseUrl: def.baseUrl ?? 'https://api.openai.com/v1',
    model: def.model,
  };
  return { name: def.name, run: () => callOpenAICompatibleWithTools(messages, tenantId, SYSTEM_PROMPT, cfg) };
}

export function resolveProviders(messages: Message[], tenantId: string): ProviderRunner[] {
  return orderedProviderDefs()
    .filter((d) => d.configured)
    .map((d) => runnerForDef(d, messages, tenantId));
}

// ─── Friendly error mapping ───────────────────────────────────────────────────
// The raw provider error is great for diagnostics but not for a school admin in
// chat. Map it to a short bilingual message; the raw text is still returned in
// `detail` (and logged) for debugging.

export function friendlyProviderError(detail: string): { type: string; message: string } {
  const d = detail.toLowerCase();
  if (/429|resource_exhausted|quota|rate.?limit|credit|billing|insufficient|exhaust|deplet|out of/.test(d)) {
    return {
      type: 'quota_exceeded',
      message:
        'تم تجاوز الحد المسموح لرموز الذكاء الاصطناعي (انتهى الرصيد). يرجى مراجعة الفوترة أو الحصة لدى مزوّد الخدمة.\n' +
        'AI token limit exceeded — the provider\'s credits/quota are depleted. Please check its billing or quota.',
    };
  }
  if (/401|403|api_key_invalid|invalid.?api.?key|unauthorized|permission|forbidden/.test(d)) {
    return {
      type: 'invalid_key',
      message:
        'مفتاح الذكاء الاصطناعي غير صالح أو غير مُصرّح به. يرجى تحديث المفتاح في إعدادات الخادم.\n' +
        'The AI key is invalid or unauthorized. Please update it in the server settings.',
    };
  }
  if (/location is not supported|user location|not available in your|unsupported_country|\bregion\b/.test(d)) {
    return {
      type: 'region_unsupported',
      message:
        'خدمة الذكاء الاصطناعي غير متاحة في منطقة الخادم الحالية. يُنصح بالتبديل إلى مزوّد آخر (مثل Groq).\n' +
        'The AI service is not available in the server\'s region. Consider switching providers (e.g. Groq).',
    };
  }
  if (/not found|\b404\b|model/.test(d)) {
    return {
      type: 'model_unavailable',
      message:
        'النموذج المحدد للذكاء الاصطناعي غير متاح. يرجى ضبط نموذج صحيح في إعدادات الخادم.\n' +
        'The configured AI model is unavailable. Please set a valid model in the server settings.',
    };
  }
  return {
    type: 'unavailable',
    message:
      'خدمة الذكاء الاصطناعي غير متاحة حالياً. يرجى المحاولة لاحقاً.\n' +
      'The AI service is temporarily unavailable. Please try again later.',
  };
}

// ─── Request schema ───────────────────────────────────────────────────────────

const InvokeLLMSchema = z.object({
  prompt:   z.string().min(1).max(8000),
  messages: z.array(z.object({
    role:    z.enum(['user', 'assistant']),
    content: z.string().max(4000),
  })).max(20).optional(),
  mode:     z.enum(['chat', 'compliance_check']).optional().default('chat'),
});

const SYSTEM_PROMPT = `You are Yamen, the AI assistant for EduSaga 360 — a Saudi school management platform.
You help school administrators, HR managers, and principals with data-driven insights about their school.

You have access to tools that query LIVE school data. Always use them rather than making up numbers.
When a user asks about employees, payroll, attendance, fees, or compliance — call the appropriate tool first.

Rules:
- Always cite specific numbers from tool results
- For compliance issues, be clear about severity (critical/warning/info)
- Respond in the same language the user writes in (Arabic or English)
- Keep responses concise and actionable
- Format numbers clearly (e.g. SAR 45,000 not 45000)
- Never invent data`;

// ─── POST /api/ai/invoke-llm ──────────────────────────────────────────────────

aiRouter.post('/invoke-llm', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = InvokeLLMSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request', errors: parsed.error.flatten() });

    const { prompt, messages, mode } = parsed.data;
    const tenant_id = req.user!.tenant_id!;

    // Compliance check shortcut — directly runs get_compliance_alerts
    if (mode === 'compliance_check') {
      const result = await runTool('get_compliance_alerts', { days_ahead: 30 }, tenant_id);
      return res.json({ response: JSON.stringify(result, null, 2), tool_used: 'get_compliance_alerts' });
    }

    // Build conversation messages
    const history: Message[] = (messages ?? []).map((m) => ({ role: m.role, content: m.content }));
    history.push({ role: 'user', content: prompt });

    // Misconfigured AI_PROVIDER override — name the exact problem.
    const forced = getForcedProvider();
    if (forced && !isKnownProvider(forced)) {
      const supported = knownProviderNames().join(', ');
      return res.json({
        provider: 'misconfigured',
        response:
          `AI_PROVIDER="${forced}" غير معروف. القيم المدعومة: ${supported}.\n\n` +
          `Unknown AI_PROVIDER="${forced}". Supported values: ${supported}.`,
      });
    }
    if (forced && isKnownProvider(forced) && !providerConfigured(forced)) {
      return res.json({
        provider: 'misconfigured',
        response:
          `AI_PROVIDER=${forced} لكن ${envVarFor(forced)} غير مضبوط في الخادم (Railway).\n\n` +
          `AI_PROVIDER=${forced} but ${envVarFor(forced)} is not set on the backend (Railway).`,
      });
    }

    // Ordered providers to attempt (honours AI_PROVIDER; all support tool use).
    const runners = resolveProviders(history, tenant_id);

    // Genuine no-provider case — the ONLY situation that warrants "add a key".
    if (runners.length === 0) {
      return res.json({
        provider: 'none',
        response:
          'خدمة الذكاء الاصطناعي غير مُفعّلة. أضف مفتاح مزوّد إلى متغيّرات البيئة في الخادم (Railway): ' +
          'GROQ_API_KEY (مجاني من console.groq.com) أو GOOGLE_AI_API_KEY أو ANTHROPIC_API_KEY.\n\n' +
          'AI service not configured. Add a provider key to the backend (Railway) environment: ' +
          'GROQ_API_KEY (free at console.groq.com), GOOGLE_AI_API_KEY, or ANTHROPIC_API_KEY.',
      });
    }

    // Try each configured provider; collect the real error from any that fail so
    // a configured-but-failing provider is never misreported as "not configured"
    // (the bug that made this look unfixable — the real cause stayed in the logs).
    const providerErrors: string[] = [];
    for (const runner of runners) {
      try {
        const response = await runner.run();
        return res.json({ response, provider: runner.name });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[ai] ${runner.name} failed:`, msg);
        providerErrors.push(`${runner.name}: ${msg}`);
      }
    }

    // A provider WAS configured but every attempt failed. Show the user a short,
    // friendly message (the raw cause stays in `detail` + the logs for debugging,
    // and in GET /api/ai/diagnostics) rather than a raw provider error blob.
    const detail = providerErrors.join(' | ') || 'unknown provider error';
    console.error('[ai] all configured providers failed:', detail);
    const friendly = friendlyProviderError(detail);
    return res.json({
      provider: 'error',
      error_type: friendly.type,
      detail,
      response: friendly.message,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown AI error';
    console.error('AI invoke-llm error:', message);
    return res.status(500).json({ error: message });
  }
});

// ─── POST /api/ai/compliance-alerts — proactive alerts, no prompt needed ──────

aiRouter.post('/compliance-alerts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenant_id = req.user!.tenant_id!;
    const days_ahead = Number(req.body.days_ahead ?? 30);

    const alerts = await runTool('get_compliance_alerts', { days_ahead }, tenant_id);

    // Generate a natural language summary using the active provider (any of
    // Gemini / Claude / Groq / OpenAI). Summary stays null if none succeed.
    let summary: string | null = null;
    const summaryMessages: Message[] = [{
      role: 'user',
      content: `Based on these compliance alerts for our school, write a short executive summary (3-5 bullet points) in Arabic. Be direct about critical items first:\n\n${JSON.stringify(alerts, null, 2)}`,
    }];
    for (const runner of resolveProviders(summaryMessages, tenant_id)) {
      try { summary = await runner.run(); break; } catch { /* try next provider */ }
    }

    return res.json({ alerts, summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Compliance alerts error:', message);
    return res.status(500).json({ error: message });
  }
});

// ─── GET /api/ai/tools — list available tools ────────────────────────────────

aiRouter.get('/tools', (_req: AuthenticatedRequest, res: Response) => {
  const active = activeProviderName();
  return res.json({
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
    provider: active === 'none' ? 'none' : `${active} (tool use enabled)`,
  });
});

// ─── GET /api/ai/diagnostics — live provider self-test ───────────────────────
// Answers "why is Yamen AI failing?" without reading Railway logs: reports the
// active provider, which keys are detected (never the value), the models, and
// the verbatim result of a minimal live call to the active provider — so
// region/key/model/quota errors are visible directly.

aiRouter.get('/diagnostics', async (_req: AuthenticatedRequest, res: Response) => {
  const geminiKeySource = process.env.GOOGLE_AI_API_KEY ? 'GOOGLE_AI_API_KEY'
    : process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY'
    : process.env.Gemini_EduSaga360 ? 'Gemini_EduSaga360'
    : null;

  const customProviders = parseCustomProviders().map((d) => ({
    name: d.name,
    format: d.format,
    model: d.model,
    base_url: d.baseUrl ?? null,
    key_detected: !!d.apiKey,
    key_source: d.keyEnvVar,
    configured: d.configured,
  }));

  const detected = {
    ai_provider_override: getForcedProvider() || null,
    ai_provider_order: getProviderOrder().length ? getProviderOrder() : null,
    active: activeProviderName(),
    // Order Yamen will actually try, given the current configuration.
    resolution_order: orderedProviderDefs().filter((d) => d.configured).map((d) => d.name),
    gemini: !!getGeminiKey(),
    gemini_key_source: geminiKeySource,
    gemini_model: getGeminiModel(),
    claude: !!getClaudeKey(),
    groq: !!getGroqKey(),
    groq_model: getGroqConfig()?.model ?? null,
    openai: !!getOpenAIKey(),
    openai_model: getOpenAIConfig()?.model ?? null,
    custom_providers: customProviders,
  };

  // Live probe of whichever provider would actually serve a request.
  const probe = await probeActiveProvider();

  return res.json({ detected, probe });
});
