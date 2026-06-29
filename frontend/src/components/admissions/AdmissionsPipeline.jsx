import React, { useState } from 'react';
import { useLanguage } from '../LanguageContext';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { differenceInDays } from 'date-fns';
import { Search, AlertTriangle, Clock, User, ChevronRight } from 'lucide-react';

const PIPELINE_STAGES = [
  { key: 'inquiry',       label_ar: 'استفسار',             label_en: 'Inquiry',             color: 'bg-sand-alt border-border',   badge: 'bg-sand-alt text-ink',  sla: 2  },
  { key: 'submitted',     label_ar: 'مقدَّم',               label_en: 'Submitted',            color: 'bg-najdi-50 border-najdi-100',      badge: 'bg-najdi-50 text-najdi-900',    sla: 3  },
  { key: 'under_review',  label_ar: 'مراجعة الوثائق',       label_en: 'Docs Review',          color: 'bg-yellow-50 border-yellow-200',  badge: 'bg-yellow-100 text-yellow-700',sla: 3  },
  { key: 'assessment',    label_ar: 'الاختبار',             label_en: 'Assessment',           color: 'bg-purple-50 border-purple-200',  badge: 'bg-purple-100 text-purple-700',sla: 5  },
  { key: 'interview',     label_ar: 'مقابلة',               label_en: 'Interview',            color: 'bg-indigo-50 border-indigo-200',  badge: 'bg-indigo-100 text-indigo-700',sla: 5  },
  { key: 'committee',     label_ar: 'اللجنة الأكاديمية',   label_en: 'Committee',            color: 'bg-orange-50 border-orange-200',  badge: 'bg-orange-100 text-orange-700',sla: 3  },
  { key: 'accepted',      label_ar: 'مقبول',                label_en: 'Accepted',             color: 'bg-green-50 border-green-200',    badge: 'bg-green-100 text-green-700',  sla: 7  },
  { key: 'waitlist',      label_ar: 'قائمة انتظار',         label_en: 'Waitlist',             color: 'bg-teal-50 border-teal-200',      badge: 'bg-teal-100 text-teal-700',    sla: 14 },
  { key: 'enrolled',      label_ar: 'ملتحق',                label_en: 'Enrolled',             color: 'bg-emerald-50 border-emerald-200',badge: 'bg-emerald-100 text-emerald-700',sla: 999},
  { key: 'rejected',      label_ar: 'مرفوض',                label_en: 'Rejected',             color: 'bg-red-50 border-red-200',        badge: 'bg-red-100 text-red-700',      sla: 999},
];

const GRADES = ['KG1','KG2','KG3','Grade1','Grade2','Grade3','Grade4','Grade5','Grade6','Grade7','Grade8','Grade9','Grade10','Grade11','Grade12'];

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
        {app.application_number && (
          <span className="text-xs text-muted-foreground font-mono">{app.application_number}</span>
        )}
      </div>
      {app.guardian_phone && (
        <p className="text-xs text-muted-foreground mt-1">{app.guardian_phone}</p>
      )}
      <div className="mt-2 flex items-center gap-1 text-muted-foreground">
        <Clock className="w-3 h-3" />
        <span className="text-xs">{daysSince === 0 ? (isRTL ? 'اليوم' : 'Today') : `${daysSince}${isRTL ? ' يوم' : 'd'}`}</span>
        {app.assigned_reviewer && (
          <>
            <span className="mx-1">·</span>
            <User className="w-3 h-3" />
            <span className="text-xs truncate max-w-[80px]">{app.assigned_reviewer}</span>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdmissionsPipeline({ applications, loading, branches: _branches, onView, onRefresh: _onRefresh }) {
  const { isRTL } = useLanguage();
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');

  const filtered = applications.filter(app => {
    const q = search.toLowerCase();
    const matchSearch = !q || app.student_name_ar?.toLowerCase().includes(q) ||
      app.student_name_en?.toLowerCase().includes(q) ||
      app.application_number?.toLowerCase().includes(q) ||
      app.guardian_phone?.includes(q);
    const matchGrade = gradeFilter === 'all' || app.applying_for_grade === gradeFilter;
    return matchSearch && matchGrade;
  });

  const byStage = (stageKey) => filtered.filter(app => {
    if (stageKey === 'submitted') return app.status === 'submitted' || app.status === 'pending';
    if (stageKey === 'interview') return app.status === 'interview' || app.pipeline_stage === 'assessment_scheduled' || app.pipeline_stage === 'assessment_done';
    if (stageKey === 'committee') return app.pipeline_stage === 'final_review';
    return app.status === stageKey || app.pipeline_stage === stageKey;
  });

  const visibleStages = PIPELINE_STAGES.filter(s => !['rejected'].includes(s.key));
  const rejectedApps = byStage('rejected');

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
          <Input
            placeholder={isRTL ? 'بحث...' : 'Search...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${isRTL ? 'pr-9' : 'pl-9'} bg-white h-8 text-sm`}
          />
        </div>
        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <SelectTrigger className="w-36 bg-white h-8 text-sm">
            <SelectValue placeholder={isRTL ? 'الصف' : 'Grade'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isRTL ? 'جميع الصفوف' : 'All Grades'}</SelectItem>
            {GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground flex items-center">
          {isRTL ? `${filtered.length} طلب` : `${filtered.length} applications`}
        </div>
      </div>

      {/* Kanban Board */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-najdi-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {visibleStages.map(stage => {
              const stageApps = byStage(stage.key);
              return (
                <div key={stage.key} className={`flex-shrink-0 w-56 rounded-xl border-2 ${stage.color}`}>
                  <div className="p-3 border-b border-current/10">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-ink">
                        {isRTL ? stage.label_ar : stage.label_en}
                      </span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${stage.badge}`}>
                        {stageApps.length}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isRTL ? `SLA: ${stage.sla} أيام` : `SLA: ${stage.sla}d`}
                    </p>
                  </div>
                  <div className="p-2 space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto">
                    {stageApps.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground text-xs">
                        {isRTL ? 'لا يوجد' : 'Empty'}
                      </div>
                    ) : (
                      stageApps.map(app => (
                        <AppCard key={app.id} app={app} stage={stage} onView={onView} isRTL={isRTL} />
                      ))
                    )}
                  </div>
                </div>
              );
            })}

            {/* Rejected column */}
            {rejectedApps.length > 0 && (
              <div className="flex-shrink-0 w-56 rounded-xl border-2 bg-red-50 border-red-200">
                <div className="p-3 border-b border-red-200">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-red-700">{isRTL ? 'مرفوض' : 'Rejected'}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{rejectedApps.length}</span>
                  </div>
                </div>
                <div className="p-2 space-y-2 max-h-64 overflow-y-auto">
                  {rejectedApps.map(app => (
                    <AppCard key={app.id} app={app} stage={PIPELINE_STAGES.find(s => s.key === 'rejected')} onView={onView} isRTL={isRTL} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}