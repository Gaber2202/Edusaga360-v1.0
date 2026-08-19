import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase, fetchData } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { useLanguage } from '../lib/LanguageContext';
import { Card, CardContent } from '../components/ui/card';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import LoadingCard from '../components/LoadingCard';
import StatusPill from '../components/StatusPill';
import { Bell } from 'lucide-react';

const PARENT_AUDIENCE = new Set(['all', 'parents', 'parent', 'guardians', null, undefined, '']);

export default function Announcements() {
  const { user } = useAuth();
  const { t, isRTL, lang } = useLanguage();
  const tenantId = user?.tenant_id;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['parent-announcements', tenantId],
    queryFn: async () => {
      const published = await fetchData(
        supabase.from('announcements')
          .select('id, title_en, title_ar, body_en, body_ar, audience, priority, status, scheduled_date, created_at')
          .eq('tenant_id', tenantId)
          .order('scheduled_date', { ascending: false })
          .limit(30)
      );
      if (published.length) return published;
      const comms = await fetchData(
        supabase.from('communications')
          .select('id, subject, body, status, sent_at, created_at, type')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(30)
      );
      return comms
        .filter((c) => !c.status || c.status === 'sent' || c.status === 'published')
        .map((c) => ({
          id: c.id,
          title_en: c.subject,
          title_ar: c.subject,
          body_en: c.body,
          body_ar: c.body,
          audience: 'parents',
          priority: c.type === 'alert' ? 'high' : 'normal',
          status: 'published',
          scheduled_date: c.sent_at,
          created_at: c.created_at,
        }));
    },
    enabled: !!tenantId,
  });

  const announcements = rows.filter((a) =>
    (a.status == null || a.status === 'published') && PARENT_AUDIENCE.has(a.audience)
  );

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t('parentPortalEyebrow')} title={t('schoolAnnouncements')} />

      {isLoading ? (
        <LoadingCard />
      ) : announcements.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={t('announcementsWillAppear')}
          description={t('announcementsNote')}
        />
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => {
            const title = isRTL ? (a.title_ar || a.title_en) : (a.title_en || a.title_ar);
            const body = isRTL ? (a.body_ar || a.body_en) : (a.body_en || a.body_ar);
            const when = a.scheduled_date || a.created_at;
            return (
              <Card key={a.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold text-ink">{title}</h3>
                    {a.priority === 'high' && (
                      <StatusPill tone="danger">{t('highPriority')}</StatusPill>
                    )}
                  </div>
                  {body && <p className="mt-2 whitespace-pre-line text-[15px] font-light leading-relaxed text-muted-foreground">{body}</p>}
                  {when && (
                    <p className="mt-4 text-[13px] text-muted-foreground">
                      {new Date(when).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB')}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
