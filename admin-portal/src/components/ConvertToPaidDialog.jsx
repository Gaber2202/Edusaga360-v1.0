import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { callApi } from '../lib/supabase';
import { PLANS, PLAN_BY_CODE, formatMoney } from '../lib/plans';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from 'sonner';
import { Sparkles, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';

const inputCls = 'w-full h-9 rounded-md border border-slate-200 px-3 text-sm bg-white';

/**
 * Trial → Paid conversion. Pre-fills list pricing/seats from the chosen plan,
 * everything stays editable per deal. Calls POST /api/admin/tenants/:id/convert.
 */
export default function ConvertToPaidDialog({ tenant, open, onOpenChange, onConverted }) {
  const qc = useQueryClient();
  const [planCode, setPlanCode] = useState('professional');
  const [cycle, setCycle] = useState('monthly');
  const [price, setPrice] = useState('');
  const [maxUsers, setMaxUsers] = useState('');
  const [maxStudents, setMaxStudents] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [saving, setSaving] = useState(false);

  // When the plan or cycle changes, refresh the list-price defaults.
  useEffect(() => {
    const plan = PLAN_BY_CODE[planCode];
    if (!plan) return;
    const monthly = cycle === 'annual' ? Math.round(plan.annual / 12) : plan.monthly;
    setPrice(String(monthly));
    setMaxUsers(String(plan.max_users));
    setMaxStudents(String(plan.max_students));
  }, [planCode, cycle]);

  useEffect(() => {
    if (open && tenant) setBillingEmail(tenant.billing_email || tenant.admin_email || '');
  }, [open, tenant]);

  if (!tenant) return null;

  const mrr = Number(price) || 0;
  const billedNow = cycle === 'annual' ? mrr * 12 : mrr;

  const convert = async () => {
    setSaving(true);
    try {
      await callApi(`/api/admin/tenants/${tenant.id}/convert`, {
        plan_code: planCode,
        billing_cycle: cycle,
        monthly_revenue: mrr,
        max_users: Number(maxUsers) || undefined,
        max_students: Number(maxStudents) || undefined,
        billing_email: billingEmail || undefined,
      });
      toast.success(`${tenant.name_en || 'Tenant'} converted to ${PLAN_BY_CODE[planCode]?.name} — ${formatMoney(mrr)}/mo`);
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      qc.invalidateQueries({ queryKey: ['admin-trials'] });
      onConverted?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e.message || 'Conversion failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            Convert to Paid Customer
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2">
            <span className="font-medium text-slate-800">{tenant.name_en || tenant.name_ar}</span>
            <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{tenant.status}</span>
            <ArrowRight className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">active · paid</span>
          </div>

          {/* Plan picker */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Plan</label>
            <div className="grid grid-cols-2 gap-2">
              {PLANS.map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setPlanCode(p.code)}
                  className={`text-left rounded-lg border p-2.5 transition-colors ${
                    planCode === p.code ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-800">{p.name}</span>
                    {planCode === p.code && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{p.blurb}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Billing Cycle</label>
              <select className={inputCls} value={cycle} onChange={(e) => setCycle(e.target.value)}>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual (billed yearly)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Price / month (SAR)</label>
              <Input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Seats (max users)</label>
              <Input type="number" min="1" value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Max students</label>
              <Input type="number" min="1" value={maxStudents} onChange={(e) => setMaxStudents(e.target.value)} className="h-9" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Billing email</label>
            <Input type="email" placeholder="finance@school.edu.sa" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} className="h-9" />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
            <div>
              <p className="text-xs text-emerald-700">{cycle === 'annual' ? 'Billed now (annual)' : 'Billed monthly'}</p>
              <p className="text-lg font-bold text-emerald-800">{formatMoney(billedNow)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Adds to MRR</p>
              <p className="text-sm font-semibold text-slate-700">{formatMoney(mrr)}/mo</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={convert} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Convert to Paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
