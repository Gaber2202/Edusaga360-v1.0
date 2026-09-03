import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Eye, Edit2, FileDown, Trash2, GitCompare, FileText, Loader2, ShieldCheck,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { statusBadgeLabel } from '../../lib/hrPolicyHelpers';

function statusTone(status) {
  if (status === 'published') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === 'under_review') return 'bg-orange-100 text-orange-800 border-orange-200';
  if (status === 'approved') return 'bg-najdi-50 text-najdi-900 border-najdi-100';
  if (status === 'archived') return 'bg-muted text-muted-foreground border-border';
  return 'bg-sand-alt text-ink border-border';
}

function statusDot(status) {
  if (status === 'published') return 'bg-emerald-500';
  if (status === 'under_review') return 'bg-orange-500';
  if (status === 'approved') return 'bg-najdi-600';
  if (status === 'archived') return 'bg-muted-foreground';
  return 'bg-amber-400';
}

/**
 * Policy library card — layout cues from 21st Insurance Policy Card +
 * Card Status List (accent header, meta panel, hover action rail, status dot).
 */
export default function PolicyLibraryCard({
  policy,
  isRTL,
  categoryLabel,
  deleting,
  downloading,
  onView,
  onEdit,
  onCompare,
  onDownload,
  onDelete,
}) {
  const [hovered, setHovered] = useState(false);
  const title = isRTL ? policy.title_ar : policy.title_en;
  const subtitle = isRTL ? policy.title_en : policy.title_ar;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-xl border bg-white',
        'border-border/80 shadow-sm transition-[border-color,box-shadow]',
        'hover:border-najdi-200 hover:shadow-md',
      )}
    >
      {/* Accent bar — Insurance Policy Card header cue */}
      <div className="h-1.5 w-full bg-gradient-to-r from-najdi-800 via-najdi-500 to-najdi-200" />

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-najdi-50 text-najdi-800 ring-1 ring-najdi-100">
            <FileText className="h-4 w-4" />
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={cn('h-2 w-2 rounded-full', statusDot(policy.status))}
              aria-hidden
            />
            <Badge
              className={cn(
                'h-5 border text-[10px] font-semibold py-0',
                statusTone(policy.status),
              )}
            >
              {statusBadgeLabel(policy.status, isRTL)}
            </Badge>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-semibold leading-snug text-ink line-clamp-2">
            {title || '—'}
          </h3>
          {subtitle && subtitle !== title && (
            <p className="text-[11px] text-muted-foreground line-clamp-1" dir="auto">
              {subtitle}
            </p>
          )}
          <p className="text-xs text-muted-foreground line-clamp-1">
            {categoryLabel || policy.category || '—'}
          </p>
        </div>

        {/* Meta panel — Insurance Policy Card detail block */}
        <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
          <div className="flex justify-between gap-2">
            <span>{isRTL ? 'الرمز' : 'Code'}</span>
            <span className="font-mono text-ink truncate max-w-[60%]">
              {policy.policy_code || '—'}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span>{isRTL ? 'السريان' : 'Effective'}</span>
            <span className="text-ink">
              {policy.effective_date
                ? String(policy.effective_date).slice(0, 10)
                : '—'}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span>{isRTL ? 'الإصدار' : 'Version'}</span>
            <span className="text-ink">{policy.current_version || 'v1.0'}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {policy.is_template && (
            <Badge variant="secondary" className="h-5 text-[10px] py-0">
              {isRTL ? 'قالب' : 'Template'}
            </Badge>
          )}
          {policy.is_mandatory && (
            <Badge
              variant="outline"
              className="h-5 text-[10px] py-0 gap-1 border-najdi-200 text-najdi-900"
            >
              <ShieldCheck className="h-3 w-3" />
              {isRTL ? 'إلزامي' : 'Required'}
            </Badge>
          )}
        </div>

        {/* Primary PDF CTA */}
        <Button
          size="sm"
          variant="outline"
          className="h-8 w-full gap-1.5 border-najdi-200 text-najdi-900 hover:bg-najdi-50"
          onClick={onDownload}
          disabled={downloading}
        >
          {downloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileDown className="h-3.5 w-3.5" />
          )}
          {isRTL ? 'تنزيل PDF' : 'Download PDF'}
        </Button>

        {/* Hover action rail — Card Status List pattern */}
        <div className="mt-auto border-t border-border/70 pt-2">
          <AnimatePresence initial={false}>
            <motion.div
              initial={false}
              animate={{ opacity: hovered ? 1 : 0.75 }}
              className="flex items-center gap-0.5"
            >
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={onView}
                title={isRTL ? 'عرض' : 'View'}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={onEdit}
                title={isRTL ? 'تعديل' : 'Edit'}
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={onCompare}
                title={isRTL ? 'مقارنة' : 'Compare'}
              >
                <GitCompare className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-destructive ms-auto"
                disabled={deleting}
                onClick={onDelete}
                title={isRTL ? 'حذف' : 'Delete'}
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </Button>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.article>
  );
}
