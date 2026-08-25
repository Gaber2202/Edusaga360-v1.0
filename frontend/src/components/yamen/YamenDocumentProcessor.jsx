import React, { useState } from 'react';
import { callApi, uploadFileApi } from '../../api/supabaseClient';
import { extractAiText, aiErrorMessage } from './yamenUtils';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { YamenSection } from './YamenShellParts';
import { yamenLayout } from '../../lib/yamenDesign';

export default function YamenDocumentProcessor({ isRTL }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      // Upload file
      const uploadResult = await uploadFileApi(file);
      const file_url = uploadResult.signedUrl || uploadResult.path;

      // Process with Gemini vision
      const visionPrompt = `Analyze this HR document image and extract:
1. Document type (ID, passport, contract, etc.)
2. Key data fields (names, dates, numbers, status)
3. Any compliance issues or warnings
4. Verification status

Respond in JSON format.`;

      const analysisResult = await callApi('/api/ai/invoke-llm', {
        prompt: visionPrompt,
        file_urls: [file_url],
        source: 'documents',
        model: 'gemini_3_pro',
        response_json_schema: {
          type: 'object',
          properties: {
            documentType: { type: 'string' },
            extractedData: { type: 'object' },
            complianceIssues: { type: 'array', items: { type: 'string' } },
            verificationStatus: { type: 'string' },
          },
        },
      });

      const text = extractAiText(analysisResult);
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { parsed = null; }
      setResult(parsed || { documentType: isRTL ? 'غير محدد' : 'Unknown', extractedData: text ? { raw: text } : {}, verificationStatus: 'review' });
      setSelectedFile(file.name);
    } catch (err) {
      setError(aiErrorMessage(err, isRTL));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className={yamenLayout.page}>
      <YamenSection
        title={isRTL ? 'معالج المستندات بالذكاء الاصطناعي' : 'AI Document Processor'}
        subtitle={isRTL ? 'ارفع صورة أو PDF لاستخراج البيانات' : 'Upload an image or PDF to extract data'}
        icon={FileText}
      >
        <div className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-najdi-400 hover:bg-sand-alt/40 transition">
          <input
            type="file"
            onChange={handleFileUpload}
            disabled={processing}
            className="hidden"
            id="doc-upload"
            accept="image/*,.pdf"
          />
          <label htmlFor="doc-upload" className="cursor-pointer flex flex-col items-center gap-2">
            {processing ? (
              <Loader2 className="w-6 h-6 text-najdi-500 animate-spin" />
            ) : (
              <Upload className="w-6 h-6 text-muted-foreground" />
            )}
            <span className="text-sm text-muted-foreground">
              {isRTL ? 'اسحب ملف أو اضغط هنا' : 'Drag or click to upload'}
            </span>
            <span className="text-xs text-muted-foreground">{isRTL ? 'الصور وملفات PDF' : 'Images & PDFs'}</span>
          </label>
        </div>

        {selectedFile && (
          <div className="text-xs text-muted-foreground mt-3">{isRTL ? 'الملف:' : 'File:'} {selectedFile}</div>
        )}

        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {result && (
          <div className="mt-3 space-y-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="flex items-center gap-2 text-emerald-700 font-medium text-sm">
              <CheckCircle className="w-4 h-4" />
              {isRTL ? 'تم التحليل' : 'Analysis Complete'}
            </div>

            <div className="space-y-2 text-xs text-ink">
              <div>
                <span className="text-muted-foreground">{isRTL ? 'نوع المستند:' : 'Type:'}</span>
                <span className="ms-2 font-medium">{result.documentType}</span>
              </div>

              {result.extractedData && Object.keys(result.extractedData).length > 0 && (
                <div>
                  <span className="text-muted-foreground block mb-1">{isRTL ? 'البيانات المستخرجة:' : 'Extracted Data:'}</span>
                  <pre className="bg-white border border-border/60 p-3 rounded-lg text-xs overflow-auto max-h-32 text-ink">
                    {JSON.stringify(result.extractedData, null, 2)}
                  </pre>
                </div>
              )}

              {result.complianceIssues?.length > 0 && (
                <div>
                  <span className="text-red-700 block mb-1 font-medium">{isRTL ? 'مشاكل الامتثال:' : 'Issues:'}</span>
                  <ul className="list-disc list-inside space-y-1">
                    {result.complianceIssues.map((issue, i) => (
                      <li key={i} className="text-red-700">{issue}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <span className="text-muted-foreground">{isRTL ? 'الحالة:' : 'Status:'}</span>
                <span className={`ms-2 font-medium ${result.verificationStatus === 'verified' ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {result.verificationStatus}
                </span>
              </div>
            </div>
          </div>
        )}
      </YamenSection>
    </div>
  );
}