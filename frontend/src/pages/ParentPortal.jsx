import React, { useState, useEffect } from 'react';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { Card, CardContent } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import PageHeader from '../components/ui/PageHeader';
import ChildSelector from '../components/parent/ChildSelector';
import AcademicRecords from '../components/parent/AcademicRecords';
import SecureMessaging from '../components/parent/SecureMessaging';
import StudentProfile from '../components/parent/StudentProfile';
import PaymentPortal from '../components/parent/PaymentPortal';
import { GraduationCap, MessageSquare, User, CreditCard, Loader2 } from 'lucide-react';

export default function ParentPortal() {
  const { t: _t, isRTL } = useLanguage();
  const { user: _user, userRole } = useRole();
  const [selectedChild, setSelectedChild] = useState(null);
  const [loading, setLoading] = useState(true);

  const isParent = userRole === 'parent';

  useEffect(() => {
    setLoading(false);
  }, []);

  // Allow parents, admins, and creators to view
  const canView = isParent || userRole === 'admin' || userRole === 'creator';

  if (!canView) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="max-w-md w-full p-6">
          <CardContent className="text-center py-6">
            <p className="text-slate-600">
              {isRTL ? 'لا يمكنك الوصول إلى هذه الصفحة' : 'You do not have access to this page'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-900" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'بوابة أولياء الأمور' : 'Parent Portal'}
        subtitle={isRTL ? 'متابعة الأداء الأكاديمي والتواصل مع المدرسة' : 'Track academic performance and communicate with school'}
      />

      {/* Child Selector */}
      <ChildSelector 
        selectedChildId={selectedChild?.id}
        onChildChange={setSelectedChild}
      />

      {/* Main Tabs */}
      <Tabs defaultValue="academic" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="academic">
            <GraduationCap className="w-4 h-4 me-2" />
            {isRTL ? 'السجل الأكاديمي' : 'Academic Records'}
          </TabsTrigger>
          <TabsTrigger value="messages">
            <MessageSquare className="w-4 h-4 me-2" />
            {isRTL ? 'الرسائل' : 'Messages'}
          </TabsTrigger>
          <TabsTrigger value="profile">
            <User className="w-4 h-4 me-2" />
            {isRTL ? 'الملف الشخصي' : 'Profile'}
          </TabsTrigger>
          <TabsTrigger value="payments">
            <CreditCard className="w-4 h-4 me-2" />
            {isRTL ? 'المدفوعات' : 'Payments'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="academic" className="mt-6">
          <AcademicRecords student={selectedChild} />
        </TabsContent>

        <TabsContent value="messages" className="mt-6">
          <SecureMessaging student={selectedChild} />
        </TabsContent>

        <TabsContent value="profile" className="mt-6">
          <StudentProfile student={selectedChild} />
        </TabsContent>

        <TabsContent value="payments" className="mt-6">
          <PaymentPortal student={selectedChild} />
        </TabsContent>
      </Tabs>
    </div>
  );
}