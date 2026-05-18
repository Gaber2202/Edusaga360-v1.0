import React, { useState, useEffect } from 'react';
import { tenantQuery } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useBranch } from '../BranchContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Filter } from 'lucide-react';
import { useTenantFilter } from '../../hooks/useTenantFilter';

export default function ReportFilters({ reportId: _reportId, filters, onChange }) {
  const { t, isRTL } = useLanguage();
  const { branches } = useBranch();
  const { tenantFilter } = useTenantFilter();
  const [grades, setGrades] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [filterValues, setFilterValues] = useState({
    branch_id: '',
    grade: '',
    status: '',
    academic_year: '',
    company_id: '',
    date_from: '',
    date_to: '',
    period: '',
    fiscal_period: ''
  });

  useEffect(() => {
    fetchFilterData();
  }, []);

  useEffect(() => {
    onChange(filterValues);
  }, [filterValues]);

  const fetchFilterData = async () => {
    try {
      const tf = tenantFilter();
      const [gradesData, companiesData, yearsData] = await Promise.all([
        tenantQuery('grades').select('*').match(tf).catch(() => []),
        tenantQuery('companys').select('*').match(tf).catch(() => []),
        tenantQuery('academic_years').select('*').match(tf).catch(() => [])
      ]);
      setGrades(gradesData);
      setCompanies(companiesData);
      setAcademicYears(yearsData);
    } catch (error) {
      console.error('Error fetching filter data:', error);
    }
  };

  const updateFilter = (key, value) => {
    setFilterValues(prev => ({ ...prev, [key]: value }));
  };

  if (!filters || filters.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Filter className="w-4 h-4" />
          {isRTL ? 'الفلاتر' : 'Filters'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filters.includes('branch') && (
            <div className="space-y-2">
              <Label>{t('branch')}</Label>
              <Select value={filterValues.branch_id} onValueChange={(v) => updateFilter('branch_id', v)}>
                <SelectTrigger>
                  <SelectValue placeholder={isRTL ? 'جميع الفروع' : 'All Branches'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>{isRTL ? 'الكل' : 'All'}</SelectItem>
                  {branches.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      {isRTL ? b.name_ar : b.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {filters.includes('grade') && (
            <div className="space-y-2">
              <Label>{t('grade')}</Label>
              <Select value={filterValues.grade} onValueChange={(v) => updateFilter('grade', v)}>
                <SelectTrigger>
                  <SelectValue placeholder={isRTL ? 'جميع الصفوف' : 'All Grades'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>{isRTL ? 'الكل' : 'All'}</SelectItem>
                  {grades.map(g => (
                    <SelectItem key={g.id} value={g.grade_code}>
                      {isRTL ? g.name_ar : g.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {filters.includes('status') && (
            <div className="space-y-2">
              <Label>{t('status')}</Label>
              <Select value={filterValues.status} onValueChange={(v) => updateFilter('status', v)}>
                <SelectTrigger>
                  <SelectValue placeholder={isRTL ? 'جميع الحالات' : 'All Status'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>{isRTL ? 'الكل' : 'All'}</SelectItem>
                  <SelectItem value="active">{t('active')}</SelectItem>
                  <SelectItem value="inactive">{t('inactive')}</SelectItem>
                  <SelectItem value="paid">{t('paid')}</SelectItem>
                  <SelectItem value="unpaid">{t('unpaid')}</SelectItem>
                  <SelectItem value="partial">{t('partial')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {filters.includes('academic_year') && (
            <div className="space-y-2">
              <Label>{t('academicYear')}</Label>
              <Select value={filterValues.academic_year} onValueChange={(v) => updateFilter('academic_year', v)}>
                <SelectTrigger>
                  <SelectValue placeholder={isRTL ? 'اختر العام' : 'Select Year'} />
                </SelectTrigger>
                <SelectContent>
                  {academicYears.map(y => (
                    <SelectItem key={y.id} value={y.year_code}>
                      {y.year_label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {filters.includes('company') && (
            <div className="space-y-2">
              <Label>{t('company')}</Label>
              <Select value={filterValues.company_id} onValueChange={(v) => updateFilter('company_id', v)}>
                <SelectTrigger>
                  <SelectValue placeholder={isRTL ? 'جميع الشركات' : 'All Companies'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>{isRTL ? 'الكل' : 'All'}</SelectItem>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {isRTL ? c.name_ar : c.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {filters.includes('date_range') && (
            <>
              <div className="space-y-2">
                <Label>{isRTL ? 'من تاريخ' : 'From Date'}</Label>
                <Input
                  type="date"
                  value={filterValues.date_from}
                  onChange={(e) => updateFilter('date_from', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'إلى تاريخ' : 'To Date'}</Label>
                <Input
                  type="date"
                  value={filterValues.date_to}
                  onChange={(e) => updateFilter('date_to', e.target.value)}
                />
              </div>
            </>
          )}

          {filters.includes('period') && (
            <div className="space-y-2">
              <Label>{isRTL ? 'الفترة' : 'Period'}</Label>
              <Input
                type="month"
                value={filterValues.period}
                onChange={(e) => updateFilter('period', e.target.value)}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}