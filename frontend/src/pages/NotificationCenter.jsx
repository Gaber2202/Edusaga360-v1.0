import React, { useState, useEffect } from 'react';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import PageHeader from '../components/ui/PageHeader';
import { NotificationService } from '../components/notifications/NotificationService';
import { Bell, Search, CheckCheck, AlertTriangle, Info, AlertCircle, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function NotificationCenter() {
  const { t: _t, isRTL, language: _language } = useLanguage();
  const { user } = useRole();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [filteredNotifications, setFilteredNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');

  const fetchNotifications = async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const data = await NotificationService.getUserNotifications(user.email, false);
      setNotifications(data);
      setFilteredNotifications(data);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [user?.email]);

  useEffect(() => {
    let filtered = notifications;

    // Tab filter
    if (activeTab === 'unread') {
      filtered = filtered.filter(n => !n.is_read);
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(n => 
        (isRTL ? n.title_ar : n.title_en).toLowerCase().includes(term) ||
        (isRTL ? n.message_ar : n.message_en).toLowerCase().includes(term)
      );
    }

    // Module filter
    if (moduleFilter !== 'all') {
      filtered = filtered.filter(n => n.module === moduleFilter);
    }

    // Severity filter
    if (severityFilter !== 'all') {
      filtered = filtered.filter(n => n.severity === severityFilter);
    }

    setFilteredNotifications(filtered);
  }, [activeTab, searchTerm, moduleFilter, severityFilter, notifications, isRTL]);

  const handleMarkAsRead = async (notification) => {
    if (notification.is_read) return;
    await NotificationService.markAsRead(notification.recipient_id);
    fetchNotifications();
  };

  const handleMarkAllAsRead = async () => {
    await NotificationService.markAllAsRead(user.email);
    toast.success(isRTL ? 'تم وضع علامة مقروء على الكل' : 'All marked as read');
    fetchNotifications();
  };

  const handleNotificationClick = (notification) => {
    handleMarkAsRead(notification);
    if (notification.link_url) {
      navigate(notification.link_url);
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'critical':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-600" />;
      default:
        return <Info className="w-5 h-5 text-najdi-700" />;
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical':
        return 'border-red-200 bg-red-50';
      case 'warning':
        return 'border-amber-200 bg-amber-50';
      default:
        return 'border-najdi-100 bg-najdi-50';
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'مركز الإشعارات' : 'Notification Center'}
        subtitle={isRTL ? 'إدارة ومتابعة الإشعارات' : 'Manage and track notifications'}
        actionLabel={unreadCount > 0 ? (isRTL ? 'تعليم الكل كمقروء' : 'Mark All Read') : null}
        actionIcon={CheckCheck}
        onAction={unreadCount > 0 ? handleMarkAllAsRead : null}
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? 'right-3' : 'left-3'} w-4 h-4 text-muted-foreground`} />
              <Input
                placeholder={isRTL ? 'بحث...' : 'Search...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={isRTL ? 'pr-10' : 'pl-10'}
              />
            </div>
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger>
                <SelectValue placeholder={isRTL ? 'الوحدة' : 'Module'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRTL ? 'كل الوحدات' : 'All Modules'}</SelectItem>
                <SelectItem value="contracts">{isRTL ? 'العقود' : 'Contracts'}</SelectItem>
                <SelectItem value="finance">{isRTL ? 'المالية' : 'Finance'}</SelectItem>
                <SelectItem value="admissions">{isRTL ? 'القبول' : 'Admissions'}</SelectItem>
                <SelectItem value="hr">{isRTL ? 'الموارد البشرية' : 'HR'}</SelectItem>
                <SelectItem value="system">{isRTL ? 'النظام' : 'System'}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger>
                <SelectValue placeholder={isRTL ? 'الخطورة' : 'Severity'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRTL ? 'كل المستويات' : 'All Levels'}</SelectItem>
                <SelectItem value="info">{isRTL ? 'معلومات' : 'Info'}</SelectItem>
                <SelectItem value="warning">{isRTL ? 'تحذير' : 'Warning'}</SelectItem>
                <SelectItem value="critical">{isRTL ? 'حرج' : 'Critical'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">
            {isRTL ? 'الكل' : 'All'} ({notifications.length})
          </TabsTrigger>
          <TabsTrigger value="unread">
            {isRTL ? 'غير مقروءة' : 'Unread'} ({unreadCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-3 mt-6">
          {loading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="animate-spin w-8 h-8 border-4 border-najdi-900 border-t-transparent rounded-full mx-auto" />
              </CardContent>
            </Card>
          ) : filteredNotifications.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {isRTL ? 'لا توجد إشعارات حتى الآن.' : 'No notifications yet.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredNotifications.map((notification) => (
              <Card
                key={notification.id}
                className={`cursor-pointer transition-all hover:shadow-md border-l-4 ${getSeverityColor(notification.severity)} ${
                  !notification.is_read ? 'bg-white' : 'bg-sand opacity-75'
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    {getSeverityIcon(notification.severity)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h3 className={`font-semibold text-ink mb-1 ${!notification.is_read ? '' : 'opacity-70'}`}>
                            {isRTL ? notification.title_ar : notification.title_en}
                          </h3>
                          <p className={`text-sm text-muted-foreground mb-2 ${!notification.is_read ? '' : 'opacity-70'}`}>
                            {isRTL ? notification.message_ar : notification.message_en}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{format(new Date(notification.created_at), 'MMM d, yyyy h:mm a')}</span>
                            <span>•</span>
                            <span className="capitalize">{isRTL ? {
                              contracts: 'العقود',
                              finance: 'المالية',
                              admissions: 'القبول',
                              hr: 'الموارد البشرية',
                              system: 'النظام'
                            }[notification.module] : notification.module}</span>
                          </div>
                        </div>
                        {!notification.is_read && (
                          <div className="w-2 h-2 rounded-full bg-najdi-700 flex-shrink-0 mt-2" />
                        )}
                      </div>
                      {notification.link_url && (
                        <Button variant="link" size="sm" className="p-0 h-auto mt-2 text-najdi-700">
                          {isRTL ? 'فتح' : 'Open'}
                          <ExternalLink className="w-3 h-3 ms-1" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}