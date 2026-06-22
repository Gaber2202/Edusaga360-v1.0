import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth.js';

export const aiRouter = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Model config ─────────────────────────────────────────────────────────────
// Gemini is the primary provider for all users. Claude is a fallback.

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const GOOGLE_AI_MODEL   = process.env.GOOGLE_AI_MODEL || 'gemini-2.0-flash';
const CLAUDE_API_KEY    = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL      = 'claude-sonnet-4-6';

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
      const query = String(input.query ?? '');
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

interface Message { role: 'user' | 'assistant'; content: string | unknown[] }

async function callClaudeWithTools(
  messages: Message[],
  tenantId: string,
  systemPrompt: string,
): Promise<string> {
  if (!CLAUDE_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');

  let currentMessages = [...messages];

  // Agentic loop — Claude may call multiple tools in sequence
  for (let iter = 0; iter < 8; iter++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         CLAUDE_API_KEY,
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

async function callGeminiWithTools(
  messages: Message[],
  tenantId: string,
  systemPrompt: string,
): Promise<string> {
  if (!GOOGLE_AI_API_KEY) throw new Error('GOOGLE_AI_API_KEY not set');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_AI_MODEL}:generateContent?key=${GOOGLE_AI_API_KEY}`;

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

// ─── Other fallback providers (text-only) ─────────────────────────────────────

function getFallbackProvider() {
  if (process.env.OPENAI_API_KEY) {
    return { name: 'openai', apiKey: process.env.OPENAI_API_KEY, endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' };
  }
  if (process.env.GROQ_API_KEY) {
    return { name: 'groq', apiKey: process.env.GROQ_API_KEY, endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' };
  }
  return null;
}

async function callFallback(provider: NonNullable<ReturnType<typeof getFallbackProvider>>, prompt: string): Promise<string> {
  const res = await fetch(provider.endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({ model: provider.model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 2048 }),
  });
  if (!res.ok) throw new Error(`AI API error (${res.status})`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? 'No response.';
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

    // Try Gemini first (primary provider, full tool support)
    if (GOOGLE_AI_API_KEY) {
      try {
        const response = await callGeminiWithTools(history, tenant_id, SYSTEM_PROMPT);
        return res.json({ response, provider: 'gemini' });
      } catch (geminiErr: unknown) {
        const msg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
        console.warn('Gemini failed, falling back:', msg);
      }
    }

    // Try Claude as fallback (tool use capable)
    if (CLAUDE_API_KEY) {
      try {
        const response = await callClaudeWithTools(history, tenant_id, SYSTEM_PROMPT);
        return res.json({ response, provider: 'claude' });
      } catch (claudeErr: unknown) {
        const msg = claudeErr instanceof Error ? claudeErr.message : String(claudeErr);
        console.warn('Claude failed, falling back:', msg);
      }
    }

    // Last-resort: text-only provider (no tool use)
    const fallback = getFallbackProvider();
    if (!fallback) {
      return res.json({
        response:
          'خدمة الذكاء الاصطناعي غير مُفعّلة. أضف GOOGLE_AI_API_KEY إلى متغيّرات البيئة في الخادم (Railway).\n\n' +
          'AI service not configured. Add GOOGLE_AI_API_KEY to the backend (Railway) environment variables.',
      });
    }
    const response = await callFallback(fallback, `${SYSTEM_PROMPT}\n\nUser: ${prompt}`);
    return res.json({ response, provider: fallback.name });

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

    // Generate a natural language summary using the best available provider
    let summary: string | null = null;
    const summaryMessages: Message[] = [{
      role: 'user',
      content: `Based on these compliance alerts for our school, write a short executive summary (3-5 bullet points) in Arabic. Be direct about critical items first:\n\n${JSON.stringify(alerts, null, 2)}`,
    }];
    if (GOOGLE_AI_API_KEY) {
      try {
        summary = await callGeminiWithTools(summaryMessages, tenant_id, SYSTEM_PROMPT);
      } catch { /* fall through */ }
    }
    if (!summary && CLAUDE_API_KEY) {
      try {
        summary = await callClaudeWithTools(summaryMessages, tenant_id, SYSTEM_PROMPT);
      } catch { /* summary stays null */ }
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
  return res.json({
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
    provider: GOOGLE_AI_API_KEY ? 'gemini (tool use enabled)' : CLAUDE_API_KEY ? 'claude (tool use enabled)' : (getFallbackProvider()?.name ?? 'none'),
  });
});
