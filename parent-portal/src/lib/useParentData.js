import { useQuery } from '@tanstack/react-query';
import { supabase, fetchData } from './supabase';
import { useAuth } from './AuthContext';

export function useParentScope() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const linkedIds = user?.linked_student_ids || [];
  const isParent = user?.user_role === 'parent' || user?.role === 'parent';
  return { user, tenantId, linkedIds, enabled: !!tenantId && (isParent || linkedIds.length > 0) };
}

export function useLinkedStudents() {
  const { tenantId, linkedIds, enabled } = useParentScope();
  return useQuery({
    queryKey: ['parent-students', tenantId, linkedIds],
    queryFn: async () => {
      if (!linkedIds.length) return [];
      const rows = await fetchData(
        supabase.from('students')
          .select('id, name_en, name_ar, status, student_id, grade_id, section_id, canteen_allergens, grades(name_en, name_ar), sections(name)')
          .eq('tenant_id', tenantId)
          .in('id', linkedIds)
      );
      return rows.map((s) => ({
        ...s,
        grade: s.grades?.name_en || s.grades?.name_ar || '',
        section: s.sections?.name || '',
      }));
    },
    enabled,
  });
}
