import React from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ArrowRight, Play } from 'lucide-react';

const workflowColors = {
  draft: 'bg-sand-alt text-muted-foreground border-border',
  submitted: 'bg-najdi-50 text-najdi-700 border-najdi-100',
  in_progress: 'bg-amber-50 text-amber-600 border-amber-200',
  completed: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  rejected: 'bg-red-50 text-red-600 border-red-200'
};

export default function ServiceTile({ icon: Icon, nameAr, nameEn, descAr, descEn, color = 'emerald', isRTL, onStart, count, status }) {
  const colorMap = {
    emerald: { iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
    blue:    { iconBg: 'bg-najdi-50',    iconColor: 'text-najdi-700' },
    amber:   { iconBg: 'bg-amber-50',   iconColor: 'text-amber-600' },
    red:     { iconBg: 'bg-red-50',     iconColor: 'text-red-600' },
    purple:  { iconBg: 'bg-purple-50',  iconColor: 'text-purple-600' },
    teal:    { iconBg: 'bg-teal-50',    iconColor: 'text-teal-600' }
  };
  const c = colorMap[color] || colorMap.emerald;

  return (
    <div className="bg-white p-4 rounded-xl border border-border shadow-sm flex flex-col gap-3 hover:shadow-md transition-all">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg ${c.iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.iconColor}`} />
        </div>
        {count !== undefined &&
          <Badge className="bg-sand-alt text-muted-foreground border border-border text-xs">{count}</Badge>
        }
        {status &&
          <Badge className={`text-xs border ${workflowColors[status] || workflowColors.draft}`}>
            {status}
          </Badge>
        }
      </div>
      <div className="flex-1">
        <h3 className="text-ink font-semibold text-sm">{isRTL ? nameAr : nameEn}</h3>
        <p className="text-muted-foreground text-xs mt-1 leading-relaxed">{isRTL ? descAr : descEn}</p>
      </div>
      <Button onClick={onStart} size="sm" className="bg-najdi-900 hover:bg-ink text-white w-full justify-between transition-all">
        <span className="flex items-center gap-1.5">
          <Play className="w-3 h-3" />
          {isRTL ? 'بدء الإجراء' : 'Start Process'}
        </span>
        <ArrowRight className="w-3 h-3" />
      </Button>
    </div>
  );
}