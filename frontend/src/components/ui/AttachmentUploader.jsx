import { useState, useRef, useCallback, useEffect } from 'react';
import { useLanguage } from '../LanguageContext';
import { uploadFileApi, getSignedUrlApi } from '../../api/supabaseClient';
import { Button } from './button';
import { X, Upload, Camera, FileText, Image, Download, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf'];
const ACCEPT_STRING = 'image/*,application/pdf';

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type) {
  if (type?.startsWith('image/')) return Image;
  return FileText;
}

/**
 * Shared attachment upload component.
 *
 * Props:
 *  - attachments: Array<{ path, signedUrl, name, size, type }>
 *  - onChange(attachments): called when attachments change
 *  - maxFiles?: number (default 10)
 *  - canDelete?: boolean (default true)
 *  - disabled?: boolean
 *  - compact?: boolean — smaller layout
 */
export default function AttachmentUploader({
  attachments = [],
  onChange,
  maxFiles = 10,
  canDelete = true,
  disabled = false,
  compact = false,
}) {
  const { isRTL } = useLanguage();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // Signed URLs expire (~1h). Persisted attachments keep a permanent `path`, so
  // re-mint a fresh URL on mount for display/download. Keyed by path; an
  // in-flight set prevents duplicate requests / render loops.
  const [freshUrls, setFreshUrls] = useState({});
  const inFlight = useRef(new Set());

  const refreshUrl = useCallback(async (path) => {
    if (!path || inFlight.current.has(path)) return;
    inFlight.current.add(path);
    try {
      const url = await getSignedUrlApi(path);
      if (url) setFreshUrls((prev) => ({ ...prev, [path]: url }));
    } catch (err) {
      console.error('[AttachmentUploader] could not refresh signed URL', err);
    } finally {
      inFlight.current.delete(path);
    }
  }, []);

  useEffect(() => {
    for (const att of attachments) {
      if (att.path && !freshUrls[att.path]) refreshUrl(att.path);
    }
  }, [attachments, freshUrls, refreshUrl]);

  const urlFor = useCallback(
    (att) => (att.path && freshUrls[att.path]) || att.signedUrl,
    [freshUrls],
  );

  const validateFile = useCallback((file) => {
    if (file.size > MAX_FILE_SIZE) {
      return isRTL ? `الملف كبير جداً (الحد ${formatFileSize(MAX_FILE_SIZE)})` : `File too large (max ${formatFileSize(MAX_FILE_SIZE)})`;
    }
    const validMime = ACCEPTED_TYPES.some(t => file.type?.startsWith(t.replace('/*', '/'))) || file.type === '';
    if (!validMime && file.name) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['jpg', 'jpeg', 'png', 'heic', 'heif', 'pdf'].includes(ext)) {
        return isRTL ? 'نوع الملف غير مدعوم (يُقبل: صور، PDF)' : 'Unsupported file type (accepted: images, PDF)';
      }
    }
    return null;
  }, [isRTL]);

  const handleUpload = useCallback(async (files) => {
    if (!files?.length) return;

    const remaining = maxFiles - attachments.length;
    if (remaining <= 0) {
      toast.error(isRTL ? `الحد الأقصى ${maxFiles} ملفات` : `Maximum ${maxFiles} files`);
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remaining);
    const errors = [];

    for (const file of filesToUpload) {
      const err = validateFile(file);
      if (err) {
        errors.push(`${file.name}: ${err}`);
      }
    }

    if (errors.length) {
      errors.forEach(e => toast.error(e));
      if (errors.length === filesToUpload.length) return;
    }

    setUploading(true);
    const newAttachments = [...attachments];

    for (const file of filesToUpload) {
      if (validateFile(file)) continue;
      try {
        const result = await uploadFileApi(file);
        newAttachments.push({
          path: result.path,
          signedUrl: result.signedUrl,
          name: file.name,
          size: file.size,
          type: file.type,
        });
      } catch (err) {
        toast.error(isRTL ? `فشل رفع ${file.name}` : `Failed to upload ${file.name}`);
        console.error('[AttachmentUploader]', err);
      }
    }

    onChange(newAttachments);
    setUploading(false);
  }, [attachments, maxFiles, onChange, validateFile, isRTL]);

  const handleDelete = useCallback((index) => {
    const updated = attachments.filter((_, i) => i !== index);
    onChange(updated);
  }, [attachments, onChange]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;
    handleUpload(e.dataTransfer.files);
  }, [disabled, uploading, handleUpload]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    if (!disabled && !uploading) setDragOver(true);
  }, [disabled, uploading]);

  const isFull = attachments.length >= maxFiles;

  return (
    <div className="space-y-3">
      {/* Drop zone / upload area */}
      {!isFull && !disabled && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragOver(false)}
          className={`
            relative rounded-xl border-2 border-dashed transition-colors
            ${dragOver ? 'border-najdi-500 bg-najdi-50' : 'border-border hover:border-najdi-500'}
            ${compact ? 'p-3' : 'p-5'}
          `}
        >
          <div className={`flex flex-col items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
            <div className="flex items-center gap-2">
              {uploading ? (
                <Loader2 className="w-5 h-5 text-najdi-700 animate-spin" />
              ) : (
                <Upload className="w-5 h-5 text-muted-foreground" />
              )}
              <span className="text-muted-foreground">
                {uploading
                  ? (isRTL ? 'جاري الرفع...' : 'Uploading...')
                  : (isRTL ? 'اسحب الملفات هنا أو' : 'Drag files here or')
                }
              </span>
            </div>

            {!uploading && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isRTL ? 'اختر ملفات' : 'Browse'}
                </Button>

                {/* Camera button — visible on touch/mobile devices */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => cameraInputRef.current?.click()}
                  className="gap-1.5 sm:hidden"
                >
                  <Camera className="w-3.5 h-3.5" />
                  {isRTL ? 'التقط صورة' : 'Camera'}
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {isRTL
                ? `صور أو PDF — حتى ${formatFileSize(MAX_FILE_SIZE)} لكل ملف`
                : `Images or PDF — up to ${formatFileSize(MAX_FILE_SIZE)} each`
              }
            </p>
          </div>

          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_STRING}
            multiple
            className="hidden"
            onChange={(e) => { handleUpload(e.target.files); e.target.value = ''; }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { handleUpload(e.target.files); e.target.value = ''; }}
          />
        </div>
      )}

      {/* Attachment list */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((att, index) => {
            const Icon = getFileIcon(att.type);
            const isImage = att.type?.startsWith('image/');
            const displayUrl = urlFor(att);

            return (
              <div
                key={att.path || index}
                className="flex items-center gap-3 rounded-lg border border-border bg-white p-2 group"
              >
                {/* Thumbnail or icon */}
                {isImage && displayUrl ? (
                  <img
                    src={displayUrl}
                    alt={att.name}
                    className="w-10 h-10 rounded object-cover flex-shrink-0"
                    onError={() => att.path && refreshUrl(att.path)}
                  />
                ) : (
                  <div className="w-10 h-10 rounded bg-sand-alt flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{att.name}</p>
                  {att.size && (
                    <p className="text-xs text-muted-foreground">{formatFileSize(att.size)}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {displayUrl && (
                    <a
                      href={displayUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={att.name}
                      className="p-1.5 rounded hover:bg-sand-alt transition-colors"
                      title={isRTL ? 'تحميل' : 'Download'}
                    >
                      <Download className="w-4 h-4 text-muted-foreground" />
                    </a>
                  )}
                  {canDelete && !disabled && (
                    <button
                      type="button"
                      onClick={() => handleDelete(index)}
                      className="p-1.5 rounded hover:bg-red-50 transition-colors"
                      title={isRTL ? 'حذف' : 'Remove'}
                    >
                      <X className="w-4 h-4 text-es-error" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state when disabled and no attachments */}
      {disabled && attachments.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 rounded-lg border border-dashed border-border">
          <AlertCircle className="w-4 h-4" />
          <span>{isRTL ? 'لا توجد مرفقات' : 'No attachments'}</span>
        </div>
      )}
    </div>
  );
}
