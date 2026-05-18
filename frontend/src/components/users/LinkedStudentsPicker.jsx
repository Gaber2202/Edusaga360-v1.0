import React, { useState } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { X, Search, GraduationCap } from 'lucide-react';

export default function LinkedStudentsPicker({ studentIds = [], onChange, students = [], isRTL }) {
  const [search, setSearch] = useState('');

  const filteredStudents = students.filter(s => {
    if (studentIds.includes(s.id)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.name_ar || '').toLowerCase().includes(q) ||
           (s.name_en || '').toLowerCase().includes(q) ||
           (s.student_id || '').toLowerCase().includes(q);
  });

  const addStudent = (id) => {
    onChange([...studentIds, id]);
    setSearch('');
  };

  const removeStudent = (id) => {
    onChange(studentIds.filter(sid => sid !== id));
  };

  const getStudentLabel = (id) => {
    const s = students.find(st => st.id === id);
    if (!s) return id;
    return `${isRTL ? s.name_ar : (s.name_en || s.name_ar)} — ${s.grade || ''}`;
  };

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1">
        <GraduationCap className="w-4 h-4" />
        {isRTL ? 'الطلاب المرتبطون' : 'Linked Students'} *
      </Label>

      {/* Selected students */}
      {studentIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {studentIds.map(id => (
            <Badge key={id} variant="secondary" className="flex items-center gap-1 py-1">
              {getStudentLabel(id)}
              <button onClick={() => removeStudent(id)} className="ms-1 hover:text-red-500">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Search & Add */}
      <div className="relative">
        <Search className="absolute start-2.5 top-2.5 w-4 h-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={isRTL ? 'ابحث عن طالب بالاسم أو الرقم...' : 'Search student by name or ID...'}
          className="ps-8"
        />
      </div>

      {search && (
        <ScrollArea className="max-h-40 border rounded-lg">
          {filteredStudents.length === 0 ? (
            <p className="p-3 text-sm text-slate-500 text-center">
              {isRTL ? 'لا توجد نتائج' : 'No results'}
            </p>
          ) : (
            <div className="p-1">
              {filteredStudents.slice(0, 10).map(s => (
                <button
                  key={s.id}
                  onClick={() => addStudent(s.id)}
                  className="w-full text-start px-3 py-2 text-sm rounded hover:bg-slate-100 flex justify-between items-center"
                >
                  <span>{isRTL ? s.name_ar : (s.name_en || s.name_ar)}</span>
                  <span className="text-xs text-slate-400">{s.grade} {s.section && `- ${s.section}`}</span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      )}

      {studentIds.length === 0 && (
        <p className="text-xs text-amber-600">
          {isRTL ? '⚠ مطلوب: اختر طالب واحد على الأقل' : '⚠ Required: select at least one student'}
        </p>
      )}
    </div>
  );
}