import React from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ArrowRight, Play } from 'lucide-react';

const workflowColors = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  submitted: 'bg-blue-50 text-blue-600 border-blue-200',
  in_progress: 'bg-amber-50 text-amber-600 border-amber-200',
  completed: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  rejected: 'bg-red-50 text-red-600 border-red-200'
};

export default function ServiceTile({ icon: Icon, nameAr, nameEn, descAr, descEn, color = 'emerald', isRTL, onStart, count, status }) {
  const colorMap = {
    emerald: { iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
    blue:    { iconBg: 'bg-blue-50',    iconColor: 'text-blue-600' },
    amber:   { iconBg: 'bg-amber-50',   iconColor: 'text-amber-600' },
    red:     { iconBg: 'bg-red-50',     iconColor: 'text-red-600' },
    purple:  { iconBg: 'bg-purple-50',  iconColor: 'text-purple-600' },
    teal:    { iconBg: 'bg-teal-50',    iconColor: 'text-teal-600' }
  };
  const c = colorMap[color] || colorMap.emerald;

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3 hover:shadow-md transition-all">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg ${c.iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.iconColor}`} />
        </div>
        {count !== undefined &&
          <Badge className="bg-slate-100 text-slate-600 border border-slate-200 text-xs">{count}</Badge>
        }
        {status &&
          <Badge className={`text-xs border ${workflowColors[status] || workflowColors.draft}`}>
            {status}
          </Badge>
        }
      </div>
      <div className="flex-1">
        <h3 className="text-slate-800 font-semibold text-sm">{isRTL ? nameAr : nameEn}</h3>
        <p className="text-slate-500 text-xs mt-1 leading-relaxed">{isRTL ? descAr : descEn}</p>
      </div>
      <Button onClick={onStart} size="sm" className="bg-slate-800 hover:bg-slate-700 text-white w-full justify-between transition-all">
        <span className="flex items-center gap-1.5">
          <Play className="w-3 h-3" />
          {isRTL ? 'بدء الإجراء' : 'Start Process'}
        </span>
        <ArrowRight className="w-3 h-3" />
      </Button>
    </div>
  );
}