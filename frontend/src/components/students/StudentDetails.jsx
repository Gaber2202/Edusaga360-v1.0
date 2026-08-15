import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTenantQuery } from '../../hooks/useTenantQuery';
import { useLanguage } from '../LanguageContext';
import { getCurrencySymbol } from '../../lib/localization';
import { useRole } from '../RoleContext';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import StatusBadge from '../ui/StatusBadge';
import { format } from 'date-fns';
import { 
  User, 
  Phone, 
  Mail, 
  Calendar, 
  GraduationCap, 
  MapPin, 
  Heart,
  Plus,
  Trash2,
  Loader2,
  X,
  DollarSign
} from 'lucide-react';
import StudentFeesSection from './StudentFeesSection';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import { useTenant } from '../TenantContext';

export default function StudentDetails({ open, onClose, student: studentProp, onUpdate }) {
  const { t, isRTL } = useLanguage();
  const { tenant } = useTenant();
  const { userRole } = useRole();
  const queryClient = useQueryClient();
  const { tenantId } = useTenantFilter();

  // Track live updates within the dialog (e.g. after applying fees)
  const [localStudent, setLocalStudent] = useState(null);
  const rawStudent = localStudent || studentProp;

  React.useEffect(() => {
    // Reset local overrides whenever parent passes a new student
    setLocalStudent(null);
  }, [studentProp?.id]);

  const handleStudentUpdated = (updatedStudent) => {
    setLocalStudent(updatedStudent);
    if (onUpdate) onUpdate(updatedStudent);
    queryClient.invalidateQueries({ queryKey: ['students'] });
  };

  const [showGuardianForm, setShowGuardianForm] = useState(false);
  const [savingGuardian, setSavingGuardian] = useState(false);
  const [guardianForm, setGuardianForm] = useState({
    name_ar: '',
    name_en: '',
    relationship: 'father',
    phone: '',
    email: '',
    national_id: '',
    occupation: '',
    is_primary: false,
    can_pickup: true
  });

  const { data: branches = [] } = useTenantQuery(
    ['branches', tenantId],
    () => fetchData(tenantQuery('branches').select('*').match({ status: 'active' }))
  );

  // Enrich student with branch name
  const student = React.useMemo(() => {
    if (!rawStudent) return rawStudent;
    const branch = branches.find(b => b.id === rawStudent.branch_id);
    return { ...rawStudent, branch_name: branch ? (isRTL ? branch.name_ar : branch.name_en || branch.name_ar) : rawStudent.branch_id };
  }, [rawStudent, branches, isRTL]);

  const { data: guardians = [], isLoading: loadingGuardians } = useTenantQuery(
    ['guardians', rawStudent?.guardian_id],
    () => fetchData(tenantQuery('guardians').select('*').eq('id', rawStudent?.guardian_id)),
    { enabled: !!rawStudent?.guardian_id }
  );

  const { data: attendanceRecords = [] } = useTenantQuery(
    ['studentAttendance', rawStudent?.id],
    () => fetchData(tenantQuery('attendances').select('*').match({ student_id: rawStudent?.id }).order('date', { ascending: false }).limit(30)),
    { enabled: !!rawStudent?.id }
  );

  const { data: invoices = [] } = useTenantQuery(
    ['studentInvoices', rawStudent?.id],
    () => fetchData(tenantQuery('invoices').select('*').match({ student_id: rawStudent?.id }).order('created_at', { ascending: false })),
    { enabled: !!rawStudent?.id }
  );

  if (!rawStudent) return null;

  const handleAddGuardian = async () => {
    setSavingGuardian(true);
    try {
      await tenantQuery('guardians').insert({
        ...guardianForm,
        student_id: student.id
      });
      queryClient.invalidateQueries({ queryKey: ['guardians', student.id] });
      setShowGuardianForm(false);
      setGuardianForm({
        name_ar: '',
        name_en: '',
        relationship: 'father',
        phone: '',
        email: '',
        national_id: '',
        occupation: '',
        is_primary: false,
        can_pickup: true
      });
    } catch (error) {
      console.error('Error adding guardian:', error);
    } finally {
      setSavingGuardian(false);
    }
  };

  const handleDeleteGuardian = async (guardianId) => {
    try {
      await tenantQuery('guardians').delete().eq('id', guardianId);
      queryClient.invalidateQueries({ queryKey: ['guardians', student.id] });
    } catch (error) {
      console.error('Error deleting guardian:', error);
    }
  };

  const attendanceStats = {
    present: attendanceRecords.filter(a => a.status === 'present').length,
    absent: attendanceRecords.filter(a => a.status === 'absent').length,
    late: attendanceRecords.filter(a => a.status === 'late').length,
    total: attendanceRecords.length
  };

  const totalFees = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
  const paidFees = invoices.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0);

  const InfoItem = ({ icon: Icon, label, value }) => (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <div className="w-8 h-8 rounded-lg bg-sand-alt flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-medium text-ink">{value || '-'}</p>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-sand-alt flex items-center justify-center overflow-hidden">
              {student.photo_url ? (
                <img src={student.photo_url} alt={student.name_ar} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl text-muted-foreground">{student.name_ar?.[0]}</span>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-ink">{student.name_ar}</h2>
              {student.name_en && <p className="text-sm text-muted-foreground">{student.name_en}</p>}
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={student.status} />
                <span className="text-sm text-muted-foreground">{student.student_id}</span>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="info" className="mt-4">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="info">{isRTL ? 'البيانات' : 'Info'}</TabsTrigger>
            <TabsTrigger value="guardians">{isRTL ? 'أولياء الأمور' : 'Guardians'}</TabsTrigger>
            <TabsTrigger value="feeplan">
              <DollarSign className="w-4 h-4 me-1" />
              {isRTL ? 'رسوم الطالب' : 'Fee Plan'}
            </TabsTrigger>
            <TabsTrigger value="attendance">{t('attendance')}</TabsTrigger>
            <TabsTrigger value="fees">{t('fees')}</TabsTrigger>
          </TabsList>

          {/* Info Tab */}
          <TabsContent value="info" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-4">
                <h3 className="font-semibold text-ink mb-3">{isRTL ? 'البيانات الشخصية' : 'Personal Info'}</h3>
                <InfoItem icon={Calendar} label={t('dateOfBirth')} value={student.date_of_birth} />
                <InfoItem icon={User} label={t('gender')} value={t(student.gender)} />
                <InfoItem icon={User} label={t('nationality')} value={student.nationality} />
                <InfoItem icon={User} label={t('nationalId')} value={student.national_id} />
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold text-ink mb-3">{isRTL ? 'البيانات الأكاديمية' : 'Academic Info'}</h3>
                <InfoItem icon={GraduationCap} label={t('grade')} value={t(student.grade)} />
                <InfoItem icon={GraduationCap} label={t('section')} value={student.section || '-'} />
                <InfoItem icon={Calendar} label={t('academicYear')} value={student.academic_year} />
                <InfoItem icon={Calendar} label={t('enrollmentDate')} value={student.enrollment_date} />
                <InfoItem icon={MapPin} label={t('branch')} value={student.branch_name || student.branch_id || '-'} />
              </Card>

              <Card className="p-4 md:col-span-2">
                <h3 className="font-semibold text-ink mb-3">{isRTL ? 'الاتصال' : 'Contact'}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                  <InfoItem icon={MapPin} label={t('address')} value={student.address} />
                  <InfoItem icon={Phone} label={isRTL ? 'هاتف الطوارئ' : 'Emergency Phone'} value={student.emergency_phone} />
                  <InfoItem icon={User} label={isRTL ? 'جهة الطوارئ' : 'Emergency Contact'} value={student.emergency_contact} />
                  <InfoItem icon={Heart} label={isRTL ? 'ملاحظات طبية' : 'Medical Notes'} value={student.medical_notes} />
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* Guardians Tab */}
          <TabsContent value="guardians" className="space-y-4 mt-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-ink">{isRTL ? 'أولياء الأمور' : 'Guardians'}</h3>
              {userRole === 'admin' && (
                <Button size="sm" onClick={() => setShowGuardianForm(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  {isRTL ? 'إضافة' : 'Add'}
                </Button>
              )}
            </div>

            {loadingGuardians ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : guardians.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">
                {isRTL ? 'لا يوجد أولياء أمور مسجلين' : 'No guardians registered'}
              </Card>
            ) : (
              <div className="space-y-3">
                {guardians.map(guardian => (
                  <Card key={guardian.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-ink">{guardian.name_ar}</h4>
                          {guardian.is_primary && (
                            <span className="text-xs bg-najdi-50 text-najdi-900 px-2 py-0.5 rounded">
                              {isRTL ? 'أساسي' : 'Primary'}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{t(guardian.relationship)}</p>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Phone className="w-4 h-4" /> {guardian.phone}
                          </span>
                          {guardian.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-4 h-4" /> {guardian.email}
                            </span>
                          )}
                        </div>
                      </div>
                      {userRole === 'admin' && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDeleteGuardian(guardian.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Guardian Form */}
            {showGuardianForm && (
              <Card className="p-4 border-2 border-najdi-900">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-semibold">{isRTL ? 'إضافة ولي أمر' : 'Add Guardian'}</h4>
                  <Button size="icon" variant="ghost" onClick={() => setShowGuardianForm(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('guardianName')} ({isRTL ? 'عربي' : 'Arabic'})</Label>
                    <Input
                      value={guardianForm.name_ar}
                      onChange={(e) => setGuardianForm(prev => ({ ...prev, name_ar: e.target.value }))}
                      dir="rtl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('relationship')}</Label>
                    <Select
                      value={guardianForm.relationship}
                      onValueChange={(v) => setGuardianForm(prev => ({ ...prev, relationship: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="father">{t('father')}</SelectItem>
                        <SelectItem value="mother">{t('mother')}</SelectItem>
                        <SelectItem value="guardian">{t('guardian')}</SelectItem>
                        <SelectItem value="other">{t('other')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('phone')}</Label>
                    <Input
                      type="tel"
                      value={guardianForm.phone}
                      onChange={(e) => setGuardianForm(prev => ({ ...prev, phone: e.target.value }))}
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('email')}</Label>
                    <Input
                      type="email"
                      value={guardianForm.email}
                      onChange={(e) => setGuardianForm(prev => ({ ...prev, email: e.target.value }))}
                      dir="ltr"
                    />
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <Button onClick={handleAddGuardian} disabled={savingGuardian} className="gap-2">
                    {savingGuardian && <Loader2 className="w-4 h-4 animate-spin" />}
                    {t('save')}
                  </Button>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* Attendance Tab */}
          <TabsContent value="attendance" className="space-y-4 mt-4">
            <div className="grid grid-cols-4 gap-4">
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold text-emerald-600">{attendanceStats.present}</p>
                <p className="text-sm text-muted-foreground">{t('present')}</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold text-red-600">{attendanceStats.absent}</p>
                <p className="text-sm text-muted-foreground">{t('absent')}</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold text-amber-600">{attendanceStats.late}</p>
                <p className="text-sm text-muted-foreground">{t('late')}</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold text-ink">
                  {attendanceStats.total > 0 
                    ? Math.round((attendanceStats.present / attendanceStats.total) * 100) 
                    : 0}%
                </p>
                <p className="text-sm text-muted-foreground">{isRTL ? 'النسبة' : 'Rate'}</p>
              </Card>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {attendanceRecords.map(record => (
                <div key={record.id} className="flex items-center justify-between p-3 bg-sand rounded-lg">
                  <span className="text-muted-foreground">{format(new Date(record.date), 'dd/MM/yyyy')}</span>
                  <StatusBadge status={record.status} />
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Fee Plan Tab */}
          <TabsContent value="feeplan" className="space-y-4 mt-4">
            <StudentFeesSection student={student} onStudentUpdated={handleStudentUpdated} />
          </TabsContent>

          {/* Fees Tab */}
          <TabsContent value="fees" className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold text-ink">{totalFees.toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</p>
                <p className="text-sm text-muted-foreground">{t('total')}</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold text-emerald-600">{paidFees.toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</p>
                <p className="text-sm text-muted-foreground">{t('paid')}</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold text-red-600">{(totalFees - paidFees).toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</p>
                <p className="text-sm text-muted-foreground">{isRTL ? 'المتبقي' : 'Remaining'}</p>
              </Card>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {invoices.map(invoice => (
                <div key={invoice.id} className="flex items-center justify-between p-3 bg-sand rounded-lg">
                  <div>
                    <p className="font-medium text-ink">{invoice.invoice_number}</p>
                    <p className="text-sm text-muted-foreground">{invoice.total_amount?.toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</p>
                  </div>
                  <StatusBadge status={invoice.status} />
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}