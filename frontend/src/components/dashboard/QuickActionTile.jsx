import React from 'react';
import { Link } from 'react-router-dom';

const accentMap = [
  'bg-najdi-50 text-najdi-700 group-hover:bg-najdi-100',
  'bg-emerald-100 text-emerald-600 group-hover:bg-emerald-200',
  'bg-purple-100 text-purple-600 group-hover:bg-purple-200',
  'bg-amber-100 text-amber-600 group-hover:bg-amber-200',
  'bg-rose-100 text-rose-600 group-hover:bg-rose-200',
  'bg-teal-100 text-teal-600 group-hover:bg-teal-200',
  'bg-indigo-100 text-indigo-600 group-hover:bg-indigo-200',
  'bg-orange-100 text-orange-600 group-hover:bg-orange-200',
];

export default function QuickActionTile({ label, icon: Icon, href, accentIndex = 0 }) {
  const accent = accentMap[accentIndex % accentMap.length];
  return (
    <Link to={href}>
      <div className="bg-white p-4 rounded-xl flex flex-col items-center gap-2 border border-border hover:border-border hover:shadow-lg hover:-translate-y-1 transition-all duration-200 group cursor-pointer">
        <div className={`w-10 h-10 rounded-lg ${accent} flex items-center justify-center transition-colors`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-muted-foreground text-xs font-semibold text-center leading-tight">{label}</span>
      </div>
    </Link>
  );
}