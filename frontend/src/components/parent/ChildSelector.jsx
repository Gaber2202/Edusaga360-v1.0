import React, { useState, useEffect } from 'react';
import { supabase, tenantQuery } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useTenant } from '../TenantContext';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Loader2 } from 'lucide-react';

export default function ChildSelector({ selectedChildId, onChildChange }) {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchChildren = async () => {
      try {
        setLoading(true);
        const user = await supabase.auth.getUser().then(r => r.data?.user);
        
        // Fetch students where mother_email matches current user email
        const { data: studentList = [] } = await tenantQuery('students').select('*').match({
          mother_email: user.email,
          tenant_id: tenant?.id
        });

        setChildren(studentList || []);
        
        // Auto-select first child if none selected
        if (studentList?.length > 0 && !selectedChildId) {
          onChildChange(studentList[0]);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (tenant?.id) {
      fetchChildren();
    }
  }, [tenant?.id, selectedChildId, onChildChange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="bg-red-50 border-red-200">
        <CardContent className="py-4 text-sm text-red-700">
          {isRTL ? 'خطأ في تحميل بيانات الطالب' : 'Error loading student data'}
        </CardContent>
      </Card>
    );
  }

  if (children.length === 0) {
    return (
      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="py-4 text-sm text-amber-700">
          {isRTL ? 'لا توجد بيانات طالب مرتبطة بحسابك' : 'No students linked to your account'}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-4">
        <div className="space-y-3">
          <p className="text-sm font-medium text-ink">
            {isRTL ? 'اختر طالب' : 'Select a Student'}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {children.map((child) => (
              <Button
                key={child.id}
                variant={selectedChildId === child.id ? 'default' : 'outline'}
                onClick={() => onChildChange(child)}
                className="justify-start h-auto py-2 px-3"
              >
                <div className="flex flex-col items-start">
                  <span className="font-medium text-sm">
                    {isRTL ? child.name_ar : child.name_en || child.name_ar}
                  </span>
                  <span className="text-xs opacity-70">
                    {child.grade} • {child.section}
                  </span>
                </div>
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}