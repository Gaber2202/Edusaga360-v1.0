import React, { useState, useEffect, useCallback } from 'react';
import { callApi } from '../lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { Bot, Loader2, Trash2, Plus, ShieldAlert, KeyRound } from 'lucide-react';

const inputCls = 'w-full h-9 rounded-md border border-border px-3 text-sm bg-white';
const labelCls = 'text-xs font-medium text-muted-foreground';

/**
 * Per-tenant Yamen AI configuration (super-admin).
 * - Set the tenant's monthly TOKEN limit (blank / 0 = unlimited).
 * - Add / remove custom LLM providers (OpenAI-compatible, incl. local/regional).
 * Provider API keys are encrypted server-side and never returned here.
 * Backend: GET/PUT/POST/DELETE /api/admin/tenants/:id/ai*
 */
export default function TenantAiDialog({ tenant, open, onOpenChange }) {
  const [loading, setLoading] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [limit, setLimit] = useState('');
  const [savingLimit, setSavingLimit] = useState(false);

  // New-provider form
  const [form, setForm] = useState({ name: '', format: 'openai', base_url: '', model: '', api_key: '' });
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    try {
      const data = await callApi(`/api/admin/tenants/${tenant.id}/ai`, {}, { method: 'GET' });
      setCfg(data);
      setLimit(data.token_limit != null ? String(data.token_limit) : '');
    } catch (e) {
      toast.error(e.message || 'Failed to load AI config');
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => { if (open) load(); }, [open, load]);

  if (!tenant) return null;

  const saveLimit = async () => {
    setSavingLimit(true);
    try {
      const token_limit = limit.trim() === '' ? null : Number(limit);
      await callApi(`/api/admin/tenants/${tenant.id}/ai/limit`, { token_limit }, { method: 'PUT' });
      toast.success('Token limit saved');
      load();
    } catch (e) {
      toast.error(e.message || 'Failed to save limit');
    } finally {
      setSavingLimit(false);
    }
  };

  const addProvider = async () => {
    if (!form.name || !form.model) { toast.error('Name and model are required'); return; }
    if (form.format === 'openai' && !form.base_url) { toast.error('Base URL is required for OpenAI-compatible providers'); return; }
    setAdding(true);
    try {
      await callApi(`/api/admin/tenants/${tenant.id}/ai/providers`, {
        name: form.name.trim(),
        format: form.format,
        base_url: form.base_url.trim() || undefined,
        model: form.model.trim(),
        api_key: form.api_key.trim() || undefined,
      });
      toast.success(`Provider "${form.name}" added`);
      setForm({ name: '', format: 'openai', base_url: '', model: '', api_key: '' });
      load();
    } catch (e) {
      toast.error(e.message || 'Failed to add provider');
    } finally {
      setAdding(false);
    }
  };

  const removeProvider = async (p) => {
    if (!window.confirm(`Remove provider "${p.name}"?`)) return;
    try {
      await callApi(`/api/admin/tenants/${tenant.id}/ai/providers/${p.id}`, {}, { method: 'DELETE' });
      toast.success('Provider removed');
      load();
    } catch (e) {
      toast.error(e.message || 'Failed to remove provider');
    }
  };

  const usedPct = cfg?.token_limit ? Math.min(100, Math.round((cfg.tokens_used_this_month / cfg.token_limit) * 100)) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-najdi-500" /> Yamen AI — {tenant.name_en || 'Tenant'}
          </DialogTitle>
        </DialogHeader>

        {loading && !cfg ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6">
            {/* Encryption warning */}
            {cfg && !cfg.encryption_configured && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Key encryption is not configured on the backend (<code>AI_CONFIG_ENC_KEY</code>). You can still set keyless local endpoints, but providers that need an API key cannot be saved until it is set.</span>
              </div>
            )}

            {/* Token limit + usage */}
            <section>
              <h3 className="text-sm font-semibold text-ink mb-2">Monthly token limit</h3>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className={labelCls}>Tokens / month (blank = unlimited)</label>
                  <input className={inputCls} type="number" min="0" placeholder="Unlimited"
                    value={limit} onChange={(e) => setLimit(e.target.value)} />
                </div>
                <Button size="sm" className="h-9" onClick={saveLimit} disabled={savingLimit}>
                  {savingLimit ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                </Button>
              </div>
              {cfg && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Used this month: <span className="font-semibold text-ink">{(cfg.tokens_used_this_month || 0).toLocaleString()}</span>
                  {cfg.token_limit ? <> / {cfg.token_limit.toLocaleString()} ({usedPct}%)</> : ' (unlimited)'}
                  {' · '}{cfg.requests_this_month || 0} requests
                  {cfg.token_limit != null && (
                    <div className="mt-1 h-1.5 w-full rounded-full bg-sand overflow-hidden">
                      <div className={`h-full ${usedPct >= 100 ? 'bg-red-500' : usedPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${usedPct}%` }} />
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Providers */}
            <section>
              <h3 className="text-sm font-semibold text-ink mb-2">Custom LLM providers</h3>
              <p className="text-xs text-muted-foreground mb-2">
                Route this tenant to its own model (e.g. a KSA-hosted LLM). Tried before the platform default. Leave the key blank for keyless local endpoints.
              </p>

              <div className="space-y-2 mb-3">
                {cfg?.providers?.length ? cfg.providers.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink flex items-center gap-2">
                        {p.name}
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1">{p.format}</span>
                        {p.has_key && <KeyRound className="w-3 h-3 text-emerald-600" title="API key stored (encrypted)" />}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{p.model}{p.base_url ? ` · ${p.base_url}` : ''}</div>
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => removeProvider(p)} title="Remove">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </div>
                )) : <p className="text-xs text-muted-foreground italic">No custom providers — this tenant uses the platform default.</p>}
              </div>

              {/* Add provider */}
              <div className="rounded-md border border-dashed border-border p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Name</label>
                    <input className={inputCls} placeholder="ksa-local" value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase() })} />
                  </div>
                  <div>
                    <label className={labelCls}>Format</label>
                    <select className={inputCls} value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>
                      <option value="openai">openai-compatible</option>
                      <option value="gemini">gemini</option>
                      <option value="anthropic">anthropic</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Model</label>
                    <input className={inputCls} placeholder="jais-30b" value={form.model}
                      onChange={(e) => setForm({ ...form, model: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Base URL {form.format === 'openai' && <span className="text-red-400">*</span>}</label>
                    <input className={inputCls} placeholder="https://llm.example.sa/v1" value={form.base_url}
                      onChange={(e) => setForm({ ...form, base_url: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelCls}>API key (optional — encrypted at rest, never shown again)</label>
                    <input className={inputCls} type="password" placeholder="sk-…" value={form.api_key}
                      onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
                  </div>
                </div>
                <Button size="sm" className="h-8 gap-1" onClick={addProvider} disabled={adding}>
                  {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Add provider</>}
                </Button>
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
