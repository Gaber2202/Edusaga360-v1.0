import React from 'react';
import { useLanguage } from '../LanguageContext';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { AlertTriangle, CheckCircle2, Landmark } from 'lucide-react';

const SAUDI_BANKS = [
  'بنك الراجحي', 'البنك الأهلي السعودي', 'بنك الرياض', 'البنك العربي الوطني',
  'بنك البلاد', 'بنك الجزيرة', 'البنك السعودي الفرنسي', 'بنك الإنماء',
  'مصرف الإنماء', 'البنك السعودي للاستثمار', 'Gulf Bank', 'بنك ساب', 'Other / أخرى'
];

function validateIBAN(iban) {
  if (!iban) return null;
  const clean = iban.replace(/\s/g, '').toUpperCase();
  if (!clean.startsWith('SA')) return 'IBAN must start with SA';
  if (clean.length !== 24) return `IBAN must be 24 chars (got ${clean.length})`;
  return null; // valid
}

export default function BankDetailsForm({ value = {}, onChange, readOnly = false, employeeNameAr = '', nationalId = '' }) {
  const { isRTL } = useLanguage();

  const update = (field, val) => onChange({ ...value, [field]: val });

  const ibanError = validateIBAN(value.iban);
  const ibanValid = value.iban && !ibanError;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Landmark className="w-4 h-4 text-najdi-700" />
        <h3 className="font-semibold text-ink text-sm">{isRTL ? 'التفاصيل البنكية' : 'Bank Details'}</h3>
      </div>

      {/* Reference info */}
      {(nationalId) && (
        <div className="bg-sand border border-border rounded-lg p-3 text-xs text-muted-foreground">
          <span className="font-semibold">{isRTL ? 'رقم الهوية / الإقامة:' : 'ID / Iqama:'}</span> {nationalId}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1 col-span-2">
          <Label>{isRTL ? 'اسم البنك' : 'Bank Name'}</Label>
          {readOnly ? (
            <p className="text-sm font-medium">{value.bank_name || '-'}</p>
          ) : (
            <Select value={value.bank_name || undefined} onValueChange={v => update('bank_name', v)}>
              <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر البنك' : 'Select bank'} /></SelectTrigger>
              <SelectContent>
                {SAUDI_BANKS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-1 col-span-2">
          <Label className="flex items-center gap-2">
            {isRTL ? 'رقم IBAN' : 'IBAN'}
            {ibanValid && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
            {value.iban && ibanError && <AlertTriangle className="w-4 h-4 text-red-500" />}
          </Label>
          {readOnly ? (
            <p className="font-mono text-sm">{value.iban || '-'}</p>
          ) : (
            <>
              <Input
                value={value.iban || ''}
                onChange={e => update('iban', e.target.value.toUpperCase())}
                placeholder="SA0000000000000000000000"
                className={`font-mono ${ibanError && value.iban ? 'border-red-400' : ibanValid ? 'border-emerald-400' : ''}`}
                maxLength={24}
              />
              {value.iban && ibanError && (
                <p className="text-xs text-red-600 mt-1">{ibanError}</p>
              )}
              {ibanValid && (
                <p className="text-xs text-emerald-600 mt-1">{isRTL ? '✓ صيغة IBAN صحيحة' : '✓ Valid IBAN format'}</p>
              )}
            </>
          )}
        </div>

        <div className="space-y-1 col-span-2">
          <Label>{isRTL ? 'اسم صاحب الحساب' : 'Account Holder Name'}</Label>
          {readOnly ? (
            <p className="text-sm">{value.account_holder_name || employeeNameAr || '-'}</p>
          ) : (
            <Input
              value={value.account_holder_name || employeeNameAr || ''}
              onChange={e => update('account_holder_name', e.target.value)}
              placeholder={isRTL ? 'الاسم كما هو في البنك' : 'Name as on bank account'}
            />
          )}
        </div>

        <div className="space-y-1">
          <Label>{isRTL ? 'رقم الحساب (اختياري)' : 'Account Number (optional)'}</Label>
          {readOnly ? (
            <p className="text-sm font-mono">{value.account_number || '-'}</p>
          ) : (
            <Input
              value={value.account_number || ''}
              onChange={e => update('account_number', e.target.value)}
              placeholder={isRTL ? 'رقم الحساب' : 'Account number'}
            />
          )}
        </div>

        <div className="space-y-1">
          <Label>{isRTL ? 'فرع البنك (اختياري)' : 'Bank Branch (optional)'}</Label>
          {readOnly ? (
            <p className="text-sm">{value.bank_branch || '-'}</p>
          ) : (
            <Input
              value={value.bank_branch || ''}
              onChange={e => update('bank_branch', e.target.value)}
              placeholder={isRTL ? 'اسم الفرع' : 'Branch name'}
            />
          )}
        </div>

        <div className="space-y-1 col-span-2">
          <Label>{isRTL ? 'رقم WPS / مدد (اختياري)' : 'WPS / Mudad ID (optional)'}</Label>
          {readOnly ? (
            <p className="text-sm font-mono">{value.wps_id || '-'}</p>
          ) : (
            <Input
              value={value.wps_id || ''}
              onChange={e => update('wps_id', e.target.value)}
              placeholder={isRTL ? 'معرف WPS أو مدد' : 'WPS or Mudad identifier'}
            />
          )}
        </div>

        <div className="space-y-1">
          <Label>{isRTL ? 'تاريخ السريان (اختياري)' : 'Effective Date (optional)'}</Label>
          {readOnly ? (
            <p className="text-sm">{value.effective_date || '-'}</p>
          ) : (
            <Input type="date" value={value.effective_date || ''} onChange={e => update('effective_date', e.target.value)} />
          )}
        </div>

        <div className="space-y-1">
          <Label>{isRTL ? 'الحالة' : 'Status'}</Label>
          {readOnly ? (
            <p className="text-sm">{value.status === 'inactive' ? (isRTL ? 'غير نشط' : 'Inactive') : (isRTL ? 'نشط' : 'Active')}</p>
          ) : (
            <Select value={value.status || 'active'} onValueChange={v => update('status', v || 'active')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{isRTL ? 'نشط' : 'Active'}</SelectItem>
                <SelectItem value="inactive">{isRTL ? 'غير نشط' : 'Inactive'}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Summary badge */}
      {(value.bank_name || value.iban) && (
        <div className={`flex items-center gap-2 p-2 rounded-lg text-xs border ${ibanValid && value.bank_name ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
          {ibanValid && value.bank_name
            ? <><CheckCircle2 className="w-3.5 h-3.5" /> {isRTL ? 'البيانات البنكية مكتملة وجاهزة للرواتب' : 'Bank details complete — ready for payroll'}</>
            : <><AlertTriangle className="w-3.5 h-3.5" /> {isRTL ? 'البيانات البنكية غير مكتملة' : 'Bank details incomplete'}</>
          }
        </div>
      )}
    </div>
  );
}