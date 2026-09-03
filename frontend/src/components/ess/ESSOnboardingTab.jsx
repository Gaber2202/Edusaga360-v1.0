import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  CheckCircle2, Circle, FileText, BookOpen, GraduationCap,
  ExternalLink, AlertCircle, Clock, Loader2
} from 'lucide-react';

export default function ESSOnboardingTab({ employee }) {
  const { isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const [policyDialog, setPolicyDialog] = useState(null);
  const [acknowledging, setAcknowledging] = useState(false);

  const { data: onboarding, isLoading } = useQuery({
    enabled: !!employee?.id,
    queryKey: ['onboarding', employee?.id],
    queryFn: () =>
      fetchData(
        tenantQuery('onboardings').select('*').match({ employee_id: employee?.id }),
      ),
    select: (data) => (Array.isArray(data) ? data[0] : data) || null,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!onboarding) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <GraduationCap className="w-14 h-14 text-muted-foreground mb-4" />
        <p className="text-muted-foreground text-lg font-medium">
          {isRTL ? 'لا يوجد برنامج إلحاق نشط' : 'No active onboarding program'}
        </p>
        <p className="text-muted-foreground text-sm mt-1">
          {isRTL ? 'سيتواصل معك HR لتفعيل برنامج الإلحاق' : 'HR will activate your onboarding program soon'}
        </p>
      </div>
    );
  }

  const docs = onboarding.hr_documents || [];
  const policies = onboarding.policy_acknowledgements || [];
  const trainings = onboarding.training_assignments || [];

  const docsComplete = docs.filter(d => d.completed).length;
  const policiesAcked = policies.filter(p => p.acknowledged).length;
  const trainingsComplete = trainings.filter(t => t.completed).length;
  const total = docs.length + policies.length + trainings.length;
  const completed = docsComplete + policiesAcked + trainingsComplete;
  const overallPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handleAcknowledgePolicy = async (policy) => {
    setAcknowledging(true);
    try {
      const updatedPolicies = policies.map(p =>
        p.id === policy.id
          ? {
              ...p,
              acknowledged: true,
              acknowledged_date: new Date().toISOString(),
              acknowledged_by: employee.name_ar,
              acknowledged_by_email: employee.email,
            }
          : p
      );

      const newCompleted = updatedPolicies.filter(p => p.acknowledged).length + docsComplete + trainingsComplete;
      const newPct = total > 0 ? Math.round((newCompleted / total) * 100) : 0;

      await tenantQuery('onboardings').update({
        policy_acknowledgements: updatedPolicies,
        overall_completion_pct: newPct,
        updated_at: new Date().toISOString(),
      }).eq('id', onboarding.id);

      queryClient.invalidateQueries({ queryKey: ['onboarding', employee?.id] });
      setPolicyDialog(null);
      toast.success(isRTL ? 'تم الإقرار بالسياسة بنجاح' : 'Policy acknowledged successfully');
    } catch (err) {
      console.error(err);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setAcknowledging(false);
    }
  };

  const statusColor = overallPct === 100 ? 'text-emerald-600' : overallPct >= 50 ? 'text-amber-600' : 'text-red-500';

  return (
    <div className="space-y-6">
      {/* Progress Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink">
                  {isRTL ? 'إجمالي التقدم' : 'Overall Progress'}
                </span>
                <span className={`text-2xl font-bold ${statusColor}`}>{overallPct}%</span>
              </div>
              <Progress value={overallPct} className="h-3" />
              <p className="text-sm text-muted-foreground">
                {completed} / {total} {isRTL ? 'مهمة مكتملة' : 'tasks completed'}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-3 bg-najdi-50 rounded-lg">
                <p className="text-xl font-bold text-najdi-700">{docsComplete}/{docs.length}</p>
                <p className="text-xs text-muted-foreground">{isRTL ? 'المستندات' : 'Documents'}</p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg">
                <p className="text-xl font-bold text-purple-600">{policiesAcked}/{policies.length}</p>
                <p className="text-xs text-muted-foreground">{isRTL ? 'السياسات' : 'Policies'}</p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-lg">
                <p className="text-xl font-bold text-emerald-600">{trainingsComplete}/{trainings.length}</p>
                <p className="text-xs text-muted-foreground">{isRTL ? 'التدريب' : 'Training'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="documents">
        <TabsList className="bg-white border">
          <TabsTrigger value="documents" className="gap-2">
            <FileText className="w-4 h-4" />
            {isRTL ? 'المستندات' : 'Documents'} {docsComplete < docs.length && <Badge className="bg-amber-100 text-amber-700 text-xs">{docs.length - docsComplete}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="policies" className="gap-2">
            <BookOpen className="w-4 h-4" />
            {isRTL ? 'السياسات' : 'Policies'} {policiesAcked < policies.length && <Badge className="bg-amber-100 text-amber-700 text-xs">{policies.length - policiesAcked}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="training" className="gap-2">
            <GraduationCap className="w-4 h-4" />
            {isRTL ? 'التدريب' : 'Training'} {trainingsComplete < trainings.length && <Badge className="bg-amber-100 text-amber-700 text-xs">{trainings.length - trainingsComplete}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {isRTL ? 'قائمة المستندات المطلوبة' : 'Required Documents Checklist'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {docs.length === 0 ? (
                <p className="text-muted-foreground text-center py-6">{isRTL ? 'لا توجد مستندات' : 'No documents assigned'}</p>
              ) : (
                <div className="space-y-3">
                  {docs.map((doc) => (
                    <div key={doc.id} className={`flex items-start gap-3 p-3 rounded-lg border ${doc.completed ? 'bg-emerald-50 border-emerald-200' : 'bg-sand border-border'}`}>
                      {doc.completed
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                        : <Circle className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{isRTL ? doc.ar : doc.en}</p>
                        {doc.required && !doc.completed && (
                          <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {isRTL ? 'مطلوب' : 'Required'}
                          </p>
                        )}
                        {doc.completed && doc.completed_date && (
                          <p className="text-xs text-emerald-600 mt-0.5">
                            {isRTL ? 'تم الإكمال:' : 'Completed:'} {format(new Date(doc.completed_date), 'dd/MM/yyyy')}
                          </p>
                        )}
                        {doc.notes && <p className="text-xs text-muted-foreground mt-0.5">{doc.notes}</p>}
                      </div>
                      <div className="flex-shrink-0">
                        {doc.document_url ? (
                          <a href={doc.document_url} target="_blank" rel="noreferrer">
                            <Button variant="ghost" size="sm" className="gap-1">
                              <ExternalLink className="w-3 h-3" />
                              {isRTL ? 'عرض' : 'View'}
                            </Button>
                          </a>
                        ) : !doc.completed ? (
                          <Badge variant="outline" className="text-xs">{isRTL ? 'قيد الانتظار' : 'Pending HR'}</Badge>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Policies Tab */}
        <TabsContent value="policies" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                {isRTL ? 'سياسات الموارد البشرية للإقرار' : 'HR Policies to Acknowledge'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {policies.length === 0 ? (
                <p className="text-muted-foreground text-center py-6">{isRTL ? 'لا توجد سياسات' : 'No policies assigned'}</p>
              ) : (
                <div className="space-y-3">
                  {policies.map((policy) => (
                    <div key={policy.id} className={`flex items-start gap-3 p-3 rounded-lg border ${policy.acknowledged ? 'bg-emerald-50 border-emerald-200' : 'bg-sand border-border'}`}>
                      {policy.acknowledged
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                        : <Circle className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{isRTL ? policy.ar : policy.en}</p>
                        {policy.category && (
                          <Badge variant="outline" className="text-xs mt-1">{policy.category}</Badge>
                        )}
                        {policy.acknowledged && policy.acknowledged_date && (
                          <p className="text-xs text-emerald-600 mt-1">
                            {isRTL ? 'تم الإقرار:' : 'Acknowledged:'} {format(new Date(policy.acknowledged_date), 'dd/MM/yyyy')}
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        {!policy.acknowledged ? (
                          <Button
                            size="sm"
                            className="bg-najdi-700 hover:bg-najdi-900 text-white text-xs"
                            onClick={() => setPolicyDialog(policy)}
                          >
                            {isRTL ? 'قراءة والإقرار' : 'Read & Sign'}
                          </Button>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                            {isRTL ? 'تم الإقرار' : 'Acknowledged'}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Training Tab */}
        <TabsContent value="training" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <GraduationCap className="w-4 h-4" />
                {isRTL ? 'برامج التدريب المخصصة' : 'Assigned Training Programs'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trainings.length === 0 ? (
                <p className="text-muted-foreground text-center py-6">{isRTL ? 'لا توجد تدريبات' : 'No training assigned'}</p>
              ) : (
                <div className="space-y-3">
                  {trainings.map((training) => (
                    <div key={training.id} className={`flex items-start gap-3 p-3 rounded-lg border ${training.completed ? 'bg-emerald-50 border-emerald-200' : 'bg-sand border-border'}`}>
                      {training.completed
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                        : <Clock className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{isRTL ? training.ar : training.en}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {training.deadline && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {isRTL ? 'الموعد النهائي:' : 'Due:'} {format(new Date(training.deadline), 'dd/MM/yyyy')}
                            </span>
                          )}
                          {training.completion_pct > 0 && !training.completed && (
                            <span>{training.completion_pct}% {isRTL ? 'مكتمل' : 'done'}</span>
                          )}
                        </div>
                        {training.completion_pct > 0 && !training.completed && (
                          <Progress value={training.completion_pct} className="h-1.5 mt-2" />
                        )}
                        {training.completed && training.completion_date && (
                          <p className="text-xs text-emerald-600 mt-1">
                            {isRTL ? 'تم الإكمال:' : 'Completed:'} {format(new Date(training.completion_date), 'dd/MM/yyyy')}
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        {training.completed
                          ? <Badge className="bg-emerald-100 text-emerald-700 text-xs">{isRTL ? 'مكتمل' : 'Done'}</Badge>
                          : <Badge className="bg-amber-100 text-amber-700 text-xs">{isRTL ? 'جارٍ' : 'In Progress'}</Badge>
                        }
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Policy Acknowledgement Dialog */}
      {policyDialog && (
        <Dialog open={!!policyDialog} onOpenChange={() => setPolicyDialog(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{isRTL ? policyDialog.ar : policyDialog.en}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              {(isRTL ? policyDialog.body_ar : policyDialog.body_en) ? (
                <div className="prose prose-sm max-w-none text-ink whitespace-pre-wrap rounded-lg bg-sand p-4 border">
                  {isRTL ? policyDialog.body_ar : policyDialog.body_en}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-6">
                  {isRTL ? 'محتوى السياسة غير متاح. يرجى التواصل مع HR.' : 'Policy content not available. Please contact HR.'}
                </p>
              )}
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800 font-medium">
                  {isRTL
                    ? 'بالنقر على "إقرار وقبول" أنت تؤكد أنك قرأت هذه السياسة وتوافق على الالتزام بها.'
                    : 'By clicking "Acknowledge & Accept" you confirm you have read this policy and agree to comply with it.'}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPolicyDialog(null)}>{isRTL ? 'إغلاق' : 'Close'}</Button>
              <Button
                onClick={() => handleAcknowledgePolicy(policyDialog)}
                disabled={acknowledging}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {acknowledging && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                <CheckCircle2 className="w-4 h-4 me-2" />
                {isRTL ? 'إقرار وقبول' : 'Acknowledge & Accept'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}