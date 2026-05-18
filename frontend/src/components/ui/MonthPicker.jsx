import React, { useState, useRef, useEffect } from 'react';
import { Button } from './button';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * MonthPicker — returns value as "yyyy-MM" string
 * Props: value (string "yyyy-MM"), onChange(string), isRTL (bool), label (string)
 */
export default function MonthPicker({ value, onChange, isRTL, label, placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Parse current value
  const parsed = value ? new Date(value + '-01') : new Date();
  const [viewYear, setViewYear] = useState(parsed.getFullYear());

  useEffect(() => {
    if (value) setViewYear(new Date(value + '-01').getFullYear());
  }, [value]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedYear = value ? parseInt(value.split('-')[0]) : null;
  const selectedMonth = value ? parseInt(value.split('-')[1]) - 1 : null;

  const selectMonth = (monthIdx) => {
    const month = String(monthIdx + 1).padStart(2, '0');
    onChange(`${viewYear}-${month}`);
    setOpen(false);
  };

  const displayValue = value
    ? `${isRTL ? MONTHS_AR[parseInt(value.split('-')[1]) - 1] : MONTHS_EN[parseInt(value.split('-')[1]) - 1]} ${value.split('-')[0]}`
    : (placeholder || (isRTL ? 'اختر الشهر' : 'Select month'));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <span className={value ? '' : 'text-muted-foreground'}>{displayValue}</span>
        <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-md border border-border bg-card shadow-lg p-3"
          style={{ [isRTL ? 'right' : 'left']: 0 }}>
          {/* Year navigation */}
          <div className="flex items-center justify-between mb-3">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewYear(y => y - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="font-semibold text-sm">{viewYear}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewYear(y => y + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          {/* Month grid */}
          <div className="grid grid-cols-3 gap-1">
            {(isRTL ? MONTHS_AR : MONTHS_EN).map((m, i) => {
              const isSelected = selectedYear === viewYear && selectedMonth === i;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectMonth(i)}
                  className={`rounded py-1.5 text-xs font-medium transition-colors
                    ${isSelected
                      ? 'bg-emerald-600 text-white'
                      : 'hover:bg-accent hover:text-accent-foreground text-foreground'}`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}