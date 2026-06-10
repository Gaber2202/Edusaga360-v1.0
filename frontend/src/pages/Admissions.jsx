import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { Button } from '../components/ui/button';
import ApplicationForm from '../components/applications/ApplicationForm';
import ApplicationDetails from '../components/applications/ApplicationDetails';
import AdmissionsPipeline from '../components/admissions/AdmissionsPipeline';
import AdmissionsListView from '../components/admissions/AdmissionsListView';
import AdmissionsDashboard from '../components/admissions/AdmissionsDashboard';
import { Plus, LayoutGrid, List, BarChart3 } from 'lucide-react';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function Admissions() {
  const { t: _t, isRTL } = useLanguage();
  const { userRole } = useRole();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const [viewMode, setViewMode] = useState('pipeline'); // pipeline | list | dashboard
  const [showForm, setShowForm] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [viewingApplication, setViewingApplication] = useState(null);

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ['applications', tenantId],
    queryFn: () => fetchData(tenantQuery('applications').select('*').match(tenantFilter()).order('created_date', { ascending: false }).limit(200)),
    enabled: hasTenantAccess,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchData(tenantQuery('branches').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['applications'] });
  };

  const handleViewApplication = (app) => setViewingApplication(app);
  const handleEditApplication = (app) => { setSelectedApplication(app); setShowForm(true); };

  const canCreate = ['admin', 'admissions', 'branch_manager'].includes(userRole);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{isRTL ? 'إدارة القبول والتسجيل' : 'Admissions Management'}</h1>
          <p className="text-sm text-slate-500">{isRTL ? 'خط سير طلبات القبول بالكامل' : 'Full admission pipeline management'}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-1 gap-1">
            <Button
              size="sm" variant={viewMode === 'pipeline' ? 'default' : 'ghost'}
              onClick={() => setViewMode('pipeline')}
              className="h-7 px-2"
            >
              <LayoutGrid className="w-4 h-4 me-1" />
              {isRTL ? 'كانبان' : 'Pipeline'}
            </Button>
            <Button
              size="sm" variant={viewMode === 'list' ? 'default' : 'ghost'}
              onClick={() => setViewMode('list')}
              className="h-7 px-2"
            >
              <List className="w-4 h-4 me-1" />
              {isRTL ? 'قائمة' : 'List'}
            </Button>
            <Button
              size="sm" variant={viewMode === 'dashboard' ? 'default' : 'ghost'}
              onClick={() => setViewMode('dashboard')}
              className="h-7 px-2"
            >
              <BarChart3 className="w-4 h-4 me-1" />
              {isRTL ? 'لوحة التحكم' : 'Dashboard'}
            </Button>
          </div>
          {canCreate && (
            <Button onClick={() => { setSelectedApplication(null); setShowForm(true); }} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 me-1" />
              {isRTL ? 'طلب جديد' : 'New Application'}
            </Button>
          )}
        </div>
      </div>

      {viewMode === 'pipeline' && (
        <AdmissionsPipeline
          applications={applications}
          loading={isLoading}
          branches={branches}
          onView={handleViewApplication}
          onRefresh={handleRefresh}
        />
      )}

      {viewMode === 'list' && (
        <AdmissionsListView
          applications={applications}
          loading={isLoading}
          branches={branches}
          onView={handleViewApplication}
          onEdit={handleEditApplication}
          userRole={userRole}
        />
      )}

      {viewMode === 'dashboard' && (
        <AdmissionsDashboard applications={applications} branches={branches} />
      )}

      <ApplicationForm
        open={showForm}
        onClose={() => { setShowForm(false); setSelectedApplication(null); }}
        onSuccess={handleRefresh}
        application={selectedApplication}
      />

      <ApplicationDetails
        open={!!viewingApplication}
        onClose={() => setViewingApplication(null)}
        application={viewingApplication}
        onUpdate={handleRefresh}
      />
    </div>
  );
}