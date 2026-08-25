import React, { useState } from 'react';
import { useLanguage } from '../LanguageContext';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { differenceInDays } from 'date-fns';
import { Search, AlertTriangle, Clock, User, ChevronRight } from 'lucide-react';
import {
  DEFAULT_ADMISSION_STAGES,
  appMatchesStage,
  normalizeApplicationStage,
} from '../../lib/admissionsPipeline';

function AppCard({ app, stage, onView, isRTL }) {
  const daysSince = app.updated_date
    ? differenceInDays(new Date(), new Date(app.updated_date))
    : differenceInDays(new Date(), new Date(app.created_at));
  const isOverdue = daysSince > stage.sla;

  return (
    <div
      onClick={() => onView(app)}
      className={`bg-white border rounded-lg p-3 cursor-pointer hover:shadow-md transition-all group ${isOverdue ? 'border-red-300 ring-1 ring-red-200' : 'border-border'}`}
    >
      {isOverdue && (
        <div className="flex items-center gap-1 text-red-500 text-xs mb-2 font-medium">
          <AlertTriangle className="w-3 h-3" />
          {isRTL ? `متأخر ${daysSince} يوم` : `Overdue ${daysSince}d`}
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink text-sm truncate">{app.student_name_ar}</p>
          {app.student_name_en && <p className="text-xs text-muted-foreground truncate">{app.student_name_en}</p>}
        </div>
        <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-1 group-hover:text-muted-foreground transition-colors" />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs bg-sand-alt text-muted-foreground px-2 py-0.5 rounded font-medium">{app.applying_for_grade}</span>
        {app.document_status === 'pending_physical_verification' && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {isRTL ? 'مستندات' : 'Docs'}
          </span>
        )}
      </div>
      {(app.assigned_reviewer || app.assigned_reviewer_name) && (
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <User className="w-3 h-3" />
          <span className="truncate">{app.assigned_reviewer || app.assigned_reviewer_name}</span>
        </div>
      )}
      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="w-3 h-3" />
        {daysSince}{isRTL ? 'ي' : 'd'}
      </div>
    </div>
  );
}

export default function AdmissionsPipeline({
  applications = [],
  loading,
  branches = [],
  stages: stagesProp,
  onView,
}) {
  const { isRTL } = useLanguage();
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const stages = stagesProp?.length ? stagesProp : DEFAULT_ADMISSION_STAGES;

  const filtered = applications.filter((app) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q ||
      app.student_name_ar?.toLowerCase().includes(q) ||
      app.student_name_en?.toLowerCase().includes(q) ||
      app.guardian_name_ar?.toLowerCase().includes(q) ||
      app.application_number?.toLowerCase().includes(q);
    const matchesBranch = branchFilter === 'all' || app.branch_id === branchFilter;
    return matchesSearch && matchesBranch;
  });

  const byStage = (stageKey) => filtered.filter((app) => appMatchesStage(app, stageKey));
  const visibleStages = stages.filter((s) => s.key !== 'rejected');
  const rejectedApps = filtered.filter((app) => normalizeApplicationStage(app) === 'rejected' || app.status === 'rejected');

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">{isRTL ? 'جاري التحميل...' : 'Loading...'}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="ps-9"
            placeholder={isRTL ? 'بحث...' : 'Search...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {branches.length > 0 && (
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={isRTL ? 'الفرع' : 'Branch'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isRTL ? 'كل الفروع' : 'All branches'}</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {isRTL ? (b.name_ar || b.name) : (b.name_en || b.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {visibleStages.map((stage) => {
          const stageApps = byStage(stage.key);
          return (
            <div key={stage.key} className={`flex-shrink-0 w-56 rounded-xl border-2 ${stage.color}`}>
              <div className="p-3 border-b border-inherit">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">
                    {isRTL ? stage.label_ar : stage.label_en}
                  </h3>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${stage.badge}`}>
                    {stageApps.length}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {isRTL ? `SLA: ${stage.sla} أيام` : `SLA: ${stage.sla}d`}
                </p>
              </div>
              <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto min-h-[120px]">
                {stageApps.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    {isRTL ? 'لا طلبات' : 'No applications'}
                  </p>
                ) : (
                  stageApps.map((app) => (
                    <AppCard key={app.id} app={app} stage={stage} onView={onView} isRTL={isRTL} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {rejectedApps.length > 0 && (
        <div className="rounded-xl border-2 border-red-200 bg-red-50 p-3">
          <h3 className="text-sm font-semibold text-red-700 mb-2">
            {isRTL ? `مرفوض (${rejectedApps.length})` : `Rejected (${rejectedApps.length})`}
          </h3>
          <div className="flex gap-2 overflow-x-auto">
            {rejectedApps.map((app) => (
              <div key={app.id} className="w-52 flex-shrink-0">
                <AppCard
                  app={app}
                  stage={stages.find((s) => s.key === 'rejected') || DEFAULT_ADMISSION_STAGES.find((s) => s.key === 'rejected')}
                  onView={onView}
                  isRTL={isRTL}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
