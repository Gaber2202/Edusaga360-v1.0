import React, { useState } from 'react';
import { tenantQuery } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useRole } from '../RoleContext';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Input } from '../ui/input';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  CheckCircle2, Circle, AlertTriangle, FileText, BookOpen,
  GraduationCap, Bot, Loader2, Clock, Plus, Trash2,
  ExternalLink, Eye, Shield, Lock
} from 'lucide-react';

function calcPct(onb) {
  const docs = onb.hr_documents || [];
  const policies = onb.policy_acknowledgements || [];
  const trainings = onb.training_assignments || [];
  const total = docs.length + policies.length + trainings.length;
  if (total === 0) return 0;
  const done = docs.filter(d => d.completed).length
    + policies.filter(p => p.acknowledged).length
    + trainings.filter(t => t.completed).length;
  return Math.round((done / total) * 100);
}

function recalcPct(docs, policies, trainings) {
  const total = docs.length + policies.length + trainings.length;
  if (total === 0) return 0;
  const done = docs.filter(d => d.completed).length
    + policies.filter(p => p.acknowledged).length
    + trainings.filter(t => t.completed).length;
  return Math.round((done / total) * 100);
}

export default function OnboardingDetailDialog({ onb, onClose, onUpdated, hrPolicies = [], aiInsight, loadingAI, onAI }) {
  const { isRTL } = useLanguage();
  const { userRole, user } = useRole();
  const queryClient = useQueryClient();
  const [savingId, setSavingId] = useState(null);
  const [localOnb, setLocalOnb] = useState(onb);

  // HR-only: add document form
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [newDoc, setNewDoc] = useState({ ar: '', en: '', required: true });
  const [addingDoc, setAddingDoc] = useState(false);

  // HR-only: add policy from library
  const [showAddPolicy, setShowAddPolicy] = useState(false);
  const [addingPolicy, setAddingPolicy] = useState(false);

  // View policy content
  const [viewingPolicy, setViewingPolicy] = useState(null);

  const isHR = ['admin', 'hr_admin', 'hr_officer'].includes(userRole);

  const saveAndSync = async (updates) => {
    const merged = { ...localOnb, ...updates };
    const pct = recalcPct(merged.hr_documents || [], merged.policy_acknowledgements || [], merged.training_assignments || []);
    const finalData = { ...updates, overall_completion_pct: pct };
    await tenantQuery('onboardings').update(finalData);
    setLocalOnb(prev => ({ ...prev, ...updates, overall_completion_pct: pct }));
    queryClient.invalidateQueries({ queryKey: ['onboardings'] });
    onUpdated?.({ ...localOnb, ...updates, overall_completion_pct: pct });
  };

  // ── Documents ──────────────────────────────────────────────
  const toggleDoc = async (docId) => {
    setSavingId(localOnb.id + docId);
    const updated = (localOnb.hr_documents || []).map(d =>
      d.id === docId ? {
        ...d,
        completed: !d.completed,
        completed_date: !d.completed ? new Date().toISOString() : null,
        completed_by: !d.completed ? (user?.full_name || user?.email || '') : null,
      } : d
    );
    await saveAndSync({ hr_documents: updated });
    setSavingId(null);
  };

  const updateDocUrl = async (docId, url) => {
    const updated = (localOnb.hr_documents || []).map(d =>
      d.id === docId ? { ...d, document_url: url } : d
    );
    await saveAndSync({ hr_documents: updated });
  };

  const deleteDoc = async (docId) => {
    const updated = (localOnb.hr_documents || []).filter(d => d.id !== docId);
    await saveAndSync({ hr_documents: updated });
  };

  const handleAddDoc = async () => {
    if (!newDoc.en.trim()) { toast.error(isRTL ? 'يرجى إدخال اسم المستند' : 'Enter document name'); return; }
    setAddingDoc(true);
    const doc = {
      id: `doc_${Date.now()}`,
      ar: newDoc.ar || newDoc.en,
      en: newDoc.en,
      required: newDoc.required,
      completed: false,
      completed_date: null,
      completed_by: null,
      document_url: '',
      notes: '',
    };
    const updated = [...(localOnb.hr_documents || []), doc];
    await saveAndSync({ hr_documents: updated });
    setNewDoc({ ar: '', en: '', required: true });
    setShowAddDoc(false);
    setAddingDoc(false);
    toast.success(isRTL ? 'تم إضافة المستند' : 'Document added');
  };

  // ── Policies ───────────────────────────────────────────────
  const acknowledgePolicy = async (polId) => {
    setSavingId(localOnb.id + polId);
    const updated = (localOnb.policy_acknowledgements || []).map(p =>
      p.id === polId ? {
        ...p,
        acknowledged: !p.acknowledged,
        acknowledged_date: !p.acknowledged ? new Date().toISOString() : null,
        acknowledged_by: !p.acknowledged ? (user?.full_name || user?.email || '') : null,
        acknowledged_by_email: !p.acknowledged ? (user?.email || '') : null,
      } : p
    );
    await saveAndSync({ policy_acknowledgements: updated });
    setSavingId(null);
  };

  const removePolicy = async (polId) => {
    const updated = (localOnb.policy_acknowledgements || []).filter(p => p.id !== polId);
    await saveAndSync({ policy_acknowledgements: updated });
  };

  const addPolicyFromLibrary = async (policy) => {
    const alreadyAdded = (localOnb.policy_acknowledgements || []).some(p => p.policy_id === policy.id);
    if (alreadyAdded) { toast.error(isRTL ? 'هذه السياسة مضافة بالفعل' : 'Policy already added'); return; }
    setAddingPolicy(true);
    const pol = {
      id: `pol_${Date.now()}`,
      policy_id: policy.id,
      ar: policy.title_ar,
      en: policy.title_en,
      category: policy.category,
      body_ar: policy.body_ar || '',
      body_en: policy.body_en || '',
      required: true,
      acknowledged: false,
      acknowledged_date: null,
      acknowledged_by: null,
      acknowledged_by_email: null,
    };
    const updated = [...(localOnb.policy_acknowledgements || []), pol];
    await saveAndSync({ policy_acknowledgements: updated });
    setAddingPolicy(false);
    toast.success(isRTL ? 'تم إضافة السياسة' : 'Policy added');
  };

  // ── Trainings ──────────────────────────────────────────────
  const toggleTraining = async (trId) => {
    setSavingId(localOnb.id + trId);
    const updated = (localOnb.training_assignments || []).map(t =>
      t.id === trId ? {
        ...t,
        completed: !t.completed,
        completion_date: !t.completed ? new Date().toISOString() : null,
        completion_pct: !t.completed ? 100 : 0,
      } : t
    );
    await saveAndSync({ training_assignments: updated });
    setSavingId(null);
  };

  const markComplete = async () => {
    await saveAndSync({ status: 'completed', completion_date: new Date().toISOString().split('T')[0] });
    toast.success(isRTL ? 'تم إكمال عملية الإلحاق' : 'Onboarding marked complete');
    onClose();
  };

  const pct = calcPct(localOnb);
  const availableToAdd = hrPolicies.filter(p =>
    p.status === 'published' &&
    !(localOnb.policy_acknowledgements || []).some(existing => existing.policy_id === p.id)
  );

  return (
    <>
      <Dialog open={!!onb} onOpenChange={() => onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <span>{localOnb.employee_name}</span>
              <Badge className={pct === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>
                {pct}% {isRTL ? 'مكتمل' : 'complete'}
              </Badge>
              {isHR && (
                <Badge className="bg-blue-100 text-blue-700 text-xs">
                  <Shield className="w-3 h-3 me-1" />{isRTL ? 'موارد بشرية' : 'HR View'}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <Progress value={pct} className="h-2 mt-1" />

          <Tabs defaultValue="docs">
            <TabsList className="w-full bg-slate-50">
              <TabsTrigger value="docs" className="flex-1">
                <FileText className="w-4 h-4 me-1" />
                {isRTL ? 'المستندات' : 'Documents'}
                <Badge className="ms-1 text-xs bg-slate-200 text-slate-600">
                  {(localOnb.hr_documents || []).filter(d => d.completed).length}/{(localOnb.hr_documents || []).length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="policies" className="flex-1">
                <BookOpen className="w-4 h-4 me-1" />
                {isRTL ? 'السياسات' : 'Policies'}
                <Badge className="ms-1 text-xs bg-slate-200 text-slate-600">
                  {(localOnb.policy_acknowledgements || []).filter(p => p.acknowledged).length}/{(localOnb.policy_acknowledgements || []).length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="trainings" className="flex-1">
                <GraduationCap className="w-4 h-4 me-1" />
                {isRTL ? 'التدريبات' : 'Trainings'}
                <Badge className="ms-1 text-xs bg-slate-200 text-slate-600">
                  {(localOnb.training_assignments || []).filter(t => t.completed).length}/{(localOnb.training_assignments || []).length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            {/* ── DOCUMENTS TAB ── */}
            <TabsContent value="docs" className="space-y-2 mt-3">
              {(localOnb.hr_documents || []).length === 0 && !isHR && (
                <div className="text-center py-8 text-slate-400 text-sm">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  {isRTL ? 'لا توجد مستندات مطلوبة بعد' : 'No documents required yet'}
                </div>
              )}
              {(localOnb.hr_documents || []).map(doc => (
                <div key={doc.id} className={`rounded-lg border transition-all ${doc.completed ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-center gap-3 p-3">
                    <button
                      className="flex-shrink-0"
                      onClick={() => isHR && toggleDoc(doc.id)}
                      disabled={savingId === localOnb.id + doc.id || !isHR}
                      title={isHR ? (doc.completed ? 'Mark incomplete' : 'Mark complete') : 'Only HR can mark complete'}
                    >
                      {savingId === localOnb.id + doc.id
                        ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                        : doc.completed
                          ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          : isHR
                            ? <Circle className="w-5 h-5 text-slate-300 hover:text-blue-400 transition-colors" />
                            : <Circle className="w-5 h-5 text-slate-200" />
                      }
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${doc.completed ? 'text-emerald-700' : 'text-slate-700'}`}>
                        {isRTL ? doc.ar : doc.en}
                        {doc.required && <span className="text-red-400 ms-1">*</span>}
                      </p>
                      {doc.completed_date && (
                        <p className="text-xs text-slate-400">
                          {isRTL ? 'أُنجز:' : 'Completed:'} {format(new Date(doc.completed_date), 'dd/MM/yyyy')}
                          {doc.completed_by && ` — ${doc.completed_by}`}
                        </p>
                      )}
                      {doc.document_url && (
                        <a href={doc.document_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-600 flex items-center gap-1 mt-0.5 hover:underline">
                          <ExternalLink className="w-3 h-3" />
                          {isRTL ? 'عرض المستند' : 'View Document'}
                        </a>
                      )}
                    </div>
                    {isHR && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          className="text-slate-400 hover:text-red-500 p-1"
                          onClick={() => deleteDoc(doc.id)}
                          title="Remove document"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  {/* HR: URL input for document link */}
                  {isHR && (
                    <div className="px-3 pb-3">
                      <Input
                        className="h-7 text-xs"
                        placeholder={isRTL ? 'رابط المستند (اختياري)...' : 'Document URL (optional)...'}
                        defaultValue={doc.document_url || ''}
                        onBlur={e => { if (e.target.value !== doc.document_url) updateDocUrl(doc.id, e.target.value); }}
                      />
                    </div>
                  )}
                </div>
              ))}

              {/* HR: Add document */}
              {isHR && (
                <div className="mt-3">
                  {!showAddDoc ? (
                    <Button size="sm" variant="outline" className="w-full gap-2 border-dashed" onClick={() => setShowAddDoc(true)}>
                      <Plus className="w-4 h-4" />
                      {isRTL ? 'إضافة مستند جديد' : 'Add Document'}
                    </Button>
                  ) : (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-semibold text-blue-800">{isRTL ? 'مستند جديد' : 'New Document'}</p>
                      <Input
                        placeholder={isRTL ? 'الاسم بالإنجليزي *' : 'Document name (English) *'}
                        value={newDoc.en}
                        onChange={e => setNewDoc(p => ({ ...p, en: e.target.value }))}
                        className="h-8 text-sm"
                      />
                      <Input
                        placeholder={isRTL ? 'الاسم بالعربي' : 'Document name (Arabic)'}
                        value={newDoc.ar}
                        onChange={e => setNewDoc(p => ({ ...p, ar: e.target.value }))}
                        className="h-8 text-sm"
                        dir="rtl"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleAddDoc} disabled={addingDoc} className="flex-1 bg-blue-600 hover:bg-blue-700">
                          {addingDoc ? <Loader2 className="w-3 h-3 animate-spin" /> : isRTL ? 'إضافة' : 'Add'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setShowAddDoc(false)}>
                          {isRTL ? 'إلغاء' : 'Cancel'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!isHR && (
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-400 bg-slate-50 rounded-lg p-3">
                  <Lock className="w-4 h-4 flex-shrink-0" />
                  {isRTL ? 'إدارة المستندات متاحة لفريق الموارد البشرية فقط' : 'Document management is restricted to HR team'}
                </div>
              )}
            </TabsContent>

            {/* ── POLICIES TAB ── */}
            <TabsContent value="policies" className="space-y-2 mt-3">
              {(localOnb.policy_acknowledgements || []).length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm">
                  <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  {isRTL ? 'لا توجد سياسات مضافة بعد' : 'No policies assigned yet'}
                  {isHR && <p className="text-xs mt-1">{isRTL ? 'أضف السياسات من مكتبة الموارد البشرية أدناه' : 'Add policies from the HR library below'}</p>}
                </div>
              )}
              {(localOnb.policy_acknowledgements || []).map(pol => (
                <div key={pol.id} className={`rounded-lg border transition-all ${pol.acknowledged ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-start gap-3 p-3">
                    <button
                      className="flex-shrink-0 mt-0.5"
                      onClick={() => !pol.acknowledged && acknowledgePolicy(pol.id)}
                      disabled={savingId === localOnb.id + pol.id || pol.acknowledged}
                      title={pol.acknowledged ? 'Already acknowledged' : 'Click to acknowledge'}
                    >
                      {savingId === localOnb.id + pol.id
                        ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                        : pol.acknowledged
                          ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          : <Circle className="w-5 h-5 text-slate-300 hover:text-emerald-400 transition-colors" />
                      }
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${pol.acknowledged ? 'text-emerald-700' : 'text-slate-700'}`}>
                        {isRTL ? pol.ar : pol.en}
                      </p>
                      {pol.category && (
                        <Badge className="text-xs bg-slate-100 text-slate-600 mt-0.5">{pol.category.replace(/_/g, ' ')}</Badge>
                      )}
                      {pol.acknowledged_date && (
                        <p className="text-xs text-slate-400 mt-1">
                          {isRTL ? 'تم الإقرار بواسطة:' : 'Acknowledged by:'} {pol.acknowledged_by || '-'}
                          {' — '}{format(new Date(pol.acknowledged_date), 'dd/MM/yyyy HH:mm')}
                        </p>
                      )}
                      {!pol.acknowledged && (
                        <p className="text-xs text-amber-600 mt-1">
                          {isRTL ? '⚠ يرجى قراءة السياسة والإقرار بها' : '⚠ Please read and acknowledge this policy'}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {(pol.body_ar || pol.body_en) && (
                        <button
                          className="text-slate-400 hover:text-blue-500 p-1"
                          onClick={() => setViewingPolicy(pol)}
                          title={isRTL ? 'عرض السياسة' : 'View Policy'}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      {isHR && (
                        <button
                          className="text-slate-400 hover:text-red-500 p-1"
                          onClick={() => removePolicy(pol.id)}
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* HR: Add from library */}
              {isHR && (
                <div className="mt-3">
                  {!showAddPolicy ? (
                    <Button size="sm" variant="outline" className="w-full gap-2 border-dashed" onClick={() => setShowAddPolicy(true)}>
                      <Plus className="w-4 h-4" />
                      {isRTL ? 'إضافة سياسة من المكتبة' : 'Add Policy from Library'}
                    </Button>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-semibold text-amber-800">{isRTL ? 'السياسات المنشورة' : 'Published Policies'}</p>
                      {availableToAdd.length === 0 ? (
                        <p className="text-xs text-slate-500 py-2">
                          {isRTL ? 'جميع السياسات المنشورة مضافة بالفعل' : 'All published policies already added'}
                        </p>
                      ) : (
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {availableToAdd.map(p => (
                            <button
                              key={p.id}
                              className="w-full text-start flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-amber-200 hover:border-amber-400 hover:bg-amber-50 transition-all text-xs"
                              onClick={() => addPolicyFromLibrary(p)}
                              disabled={addingPolicy}
                            >
                              <span className="font-medium text-slate-700">{isRTL ? p.title_ar : p.title_en}</span>
                              <Badge className="text-xs bg-amber-100 text-amber-700 flex-shrink-0">{p.category?.replace(/_/g, ' ')}</Badge>
                            </button>
                          ))}
                        </div>
                      )}
                      <Button size="sm" variant="outline" className="w-full" onClick={() => setShowAddPolicy(false)}>
                        {isRTL ? 'إغلاق' : 'Close'}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {!isHR && (localOnb.policy_acknowledgements || []).filter(p => !p.acknowledged).length > 0 && (
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                  {isRTL ? 'انقر على السياسة للإقرار بها — يُعدّ ذلك توقيعاً رقمياً على الاطلاع والامتثال' : 'Click on a policy to acknowledge it — this serves as a digital confirmation of review and compliance'}
                </div>
              )}
            </TabsContent>

            {/* ── TRAININGS TAB ── */}
            <TabsContent value="trainings" className="space-y-2 mt-3">
              {(localOnb.training_assignments || []).map(tr => {
                const overdue = !tr.completed && tr.deadline && new Date(tr.deadline) < new Date();
                return (
                  <button
                    key={tr.id}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-start ${tr.completed ? 'bg-emerald-50 border-emerald-200' : overdue ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                    onClick={() => isHR && toggleTraining(tr.id)}
                    disabled={savingId === localOnb.id + tr.id || !isHR}
                  >
                    {savingId === localOnb.id + tr.id
                      ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                      : tr.completed
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        : overdue
                          ? <AlertTriangle className="w-5 h-5 text-red-500" />
                          : <Clock className="w-5 h-5 text-slate-300" />}
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${tr.completed ? 'text-emerald-700' : overdue ? 'text-red-700' : 'text-slate-700'}`}>
                        {isRTL ? tr.ar : tr.en}
                      </p>
                      <p className={`text-xs ${overdue ? 'text-red-500' : 'text-slate-400'}`}>
                        {isRTL ? 'الموعد النهائي:' : 'Deadline:'} {tr.deadline}
                        {overdue && ` — ${isRTL ? 'متأخر' : 'OVERDUE'}`}
                      </p>
                    </div>
                  </button>
                );
              })}
              {!isHR && (
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-400 bg-slate-50 rounded-lg p-3">
                  <Lock className="w-4 h-4 flex-shrink-0" />
                  {isRTL ? 'يمكن للموارد البشرية فقط تحديث حالة التدريبات' : 'Only HR can update training completion status'}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Yamen AI */}
          <div className="border-t pt-4 space-y-3 mt-2">
            <Button onClick={() => onAI(localOnb)} disabled={loadingAI} className="w-full bg-purple-600 hover:bg-purple-700 gap-2">
              {loadingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
              {isRTL ? 'تحليل يامن AI — مخاطر الإلحاق' : 'Yamen AI — Onboarding Risk Analysis'}
            </Button>
            {aiInsight && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 whitespace-pre-wrap text-sm text-slate-700">
                {aiInsight}
              </div>
            )}
          </div>

          {localOnb.status === 'in_progress' && pct === 100 && isHR && (
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2 mt-2" onClick={markComplete}>
              <CheckCircle2 className="w-4 h-4" />
              {isRTL ? 'تأكيد إكمال الإلحاق' : 'Mark Onboarding Complete'}
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* Policy Content Viewer */}
      {viewingPolicy && (
        <Dialog open={!!viewingPolicy} onOpenChange={() => setViewingPolicy(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{isRTL ? viewingPolicy.ar : viewingPolicy.en}</DialogTitle>
            </DialogHeader>
            <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap text-sm leading-relaxed">
              {isRTL
                ? (viewingPolicy.body_ar || viewingPolicy.body_en || (isRTL ? 'لا يوجد محتوى' : 'No content'))
                : (viewingPolicy.body_en || viewingPolicy.body_ar || 'No content available')}
            </div>
            {!viewingPolicy.acknowledged && (
              <div className="border-t pt-4">
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2"
                  disabled={savingId === localOnb.id + viewingPolicy.id}
                  onClick={async () => {
                    await acknowledgePolicy(viewingPolicy.id);
                    setViewingPolicy(null);
                  }}
                >
                  {savingId === localOnb.id + viewingPolicy.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <CheckCircle2 className="w-4 h-4" />}
                  {isRTL ? 'إقرار بالاطلاع والامتثال' : 'I Acknowledge & Comply'}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}