import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData, callApi, uploadFileApi } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import {
  AlertTriangle, CheckCircle, Upload, Camera, FileText,
  User, Phone, Mail, Loader2, ChevronRight, X
} from 'lucide-react';

const REQUIRED_DOCUMENT_TYPES = [
  { code: 'national_id',       label_ar: 'هوية وطنية / إقامة',       label_en: 'National ID / Iqama' },
  { code: 'birth_certificate',  label_ar: 'شهادة الميلاد',            label_en: 'Birth Certificate' },
  { code: 'vaccination_record', label_ar: 'سجل التطعيمات',            label_en: 'Vaccination Record' },
  { code: 'school_report',      label_ar: 'كشف درجات المدرسة السابقة', label_en: 'Prior School Report' },
  { code: 'photo',              label_ar: 'صورة شخصية',               label_en: 'Student Photo' },
];

export default function DocumentVerificationQueue() {
  const { isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const [selectedApp, setSelectedApp] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(null);

  const { data: pendingApps = [], isLoading } = useQuery({
    queryKey: ['pendingVerifications', tenantId],
    queryFn: () => fetchData(
      tenantQuery('applications')
        .select('*')
        .match(tenantFilter({ document_status: 'pending_physical_verification' }))
        .order('created_at', { ascending: false })
    ),
    enabled: hasTenantAccess,
  });

  const handleDocUpload = async (file, docCode) => {
    setUploadingDoc(docCode);
    try {
      const result = await uploadFileApi(file);
      const newDoc = {
        doc_code: docCode,
        name: file.name,
        url: result.signedUrl || result.path,
        type: file.type,
        verified_at: new Date().toISOString(),
      };

      // Try backend API first
      try {
        const response = await callApi(`/api/intake/verify-documents/${selectedApp.id}`, {
          verified_documents: [newDoc],
        });

        if (response.status === 'documents_complete') {
          toast.success(isRTL ? 'اكتملت جميع المستندات! تم تقديم الطلب تلقائياً.' : 'All documents complete! Application auto-advanced.');
          setSelectedApp(null);
        } else {
          toast.success(isRTL ? 'تم رفع المستند بنجاح' : 'Document uploaded successfully');
          // Update local state
          setSelectedApp(prev => ({
            ...prev,
            documents: [...(prev.documents || []), newDoc],
            missing_documents: response.missing_documents,
            document_status: response.status,
          }));
        }
      } catch (_apiErr) {
        // Fallback: direct update
        const existingDocs = Array.isArray(selectedApp.documents) ? selectedApp.documents : [];
        const updatedDocs = [...existingDocs, newDoc];
        const updatedMissing = (selectedApp.missing_documents || []).filter(c => c !== docCode);
        const allComplete = updatedMissing.length === 0;

        await tenantQuery('applications').update({
          documents: updatedDocs,
          missing_documents: updatedMissing,
          document_status: allComplete ? 'documents_complete' : 'pending_physical_verification',
          ...(allComplete ? { pipeline_stage: 'under_review' } : {}),
        }).eq('id', selectedApp.id);

        if (allComplete) {
          // Update student status
          await tenantQuery('students').update({
            status: 'active',
            doc_status: 'documents_complete',
            missing_documents: [],
          }).eq('application_id', selectedApp.id);

          toast.success(isRTL ? 'اكتملت جميع المستندات!' : 'All documents complete!');
          setSelectedApp(null);
        } else {
          toast.success(isRTL ? 'تم رفع المستند' : 'Document uploaded');
          setSelectedApp(prev => ({
            ...prev,
            documents: updatedDocs,
            missing_documents: updatedMissing,
          }));
        }
      }

      queryClient.invalidateQueries({ queryKey: ['pendingVerifications'] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    } catch (err) {
      console.error('Upload error:', err);
      toast.error(isRTL ? 'فشل رفع الملف' : 'Upload failed');
    } finally {
      setUploadingDoc(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-najdi-700" />
      </div>
    );
  }

  if (pendingApps.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-muted-foreground">
            {isRTL ? 'لا توجد طلبات بانتظار التحقق من المستندات' : 'No applications pending document verification'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {pendingApps.map(app => {
          const missingCount = app.missing_documents?.length || 0;
          return (
            <Card key={app.id} className="cursor-pointer hover:border-najdi-200 transition-colors" onClick={() => setSelectedApp(app)}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-ink truncate">{app.student_name_ar || app.student_name_en}</p>
                      <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50 text-xs">
                        {missingCount} {isRTL ? 'مستند ناقص' : 'missing'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {app.guardian_name_ar || app.guardian_name_en}
                      </span>
                      {app.guardian_phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          <span dir="ltr">{app.guardian_phone}</span>
                        </span>
                      )}
                      <span>{app.applying_for_grade}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Verification Dialog */}
      <Dialog open={!!selectedApp} onOpenChange={(open) => !open && setSelectedApp(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isRTL ? 'التحقق من المستندات' : 'Document Verification'}
            </DialogTitle>
          </DialogHeader>

          {selectedApp && (
            <div className="space-y-4">
              {/* Student info */}
              <div className="bg-sand p-3 rounded-lg space-y-1">
                <p className="font-semibold text-ink">{selectedApp.student_name_ar}</p>
                <p className="text-sm text-muted-foreground">{selectedApp.student_name_en}</p>
                <div className="flex gap-4 text-xs text-muted-foreground mt-2">
                  <span>{selectedApp.applying_for_grade}</span>
                  <span>{selectedApp.academic_year}</span>
                  <span className="font-mono">{selectedApp.application_number}</span>
                </div>
              </div>

              {/* Guardian contact */}
              <div className="flex gap-3 text-sm">
                {selectedApp.guardian_phone && (
                  <a href={`tel:${selectedApp.guardian_phone}`} className="flex items-center gap-1 text-najdi-700 hover:underline">
                    <Phone className="w-4 h-4" />
                    <span dir="ltr">{selectedApp.guardian_phone}</span>
                  </a>
                )}
                {selectedApp.guardian_email && (
                  <a href={`mailto:${selectedApp.guardian_email}`} className="flex items-center gap-1 text-najdi-700 hover:underline">
                    <Mail className="w-4 h-4" />
                    {selectedApp.guardian_email}
                  </a>
                )}
              </div>

              {/* Document checklist */}
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {isRTL ? 'قائمة المستندات:' : 'Document Checklist:'}
                </p>
                {REQUIRED_DOCUMENT_TYPES.map(docType => {
                  const existing = (selectedApp.documents || []).find(d => d.doc_code === docType.code);
                  const isMissing = (selectedApp.missing_documents || []).includes(docType.code);
                  const isUploading = uploadingDoc === docType.code;

                  return (
                    <div
                      key={docType.code}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${
                        existing ? 'border-green-200 bg-green-50' : isMissing ? 'border-amber-200 bg-amber-50' : 'border-border'
                      }`}
                    >
                      {existing ? (
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{isRTL ? docType.label_ar : docType.label_en}</p>
                        {existing && (
                          <a href={existing.url} target="_blank" rel="noreferrer" className="text-xs text-najdi-700 hover:underline truncate block">
                            {existing.name}
                          </a>
                        )}
                      </div>
                      {!existing && (
                        <Label htmlFor={`verify-${docType.code}`} className="cursor-pointer flex-shrink-0">
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border rounded-md text-xs font-medium text-najdi-700 hover:bg-najdi-50 transition-colors">
                            {isUploading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Camera className="w-3.5 h-3.5" />
                            )}
                            {isRTL ? 'رفع' : 'Upload'}
                          </div>
                          <Input
                            id={`verify-${docType.code}`}
                            type="file"
                            accept="image/*,application/pdf"
                            capture="environment"
                            disabled={isUploading}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleDocUpload(file, docType.code);
                              e.target.value = '';
                            }}
                            className="hidden"
                          />
                        </Label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedApp(null)}>
              {isRTL ? 'إغلاق' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
