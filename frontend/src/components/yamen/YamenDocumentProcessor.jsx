import React, { useState } from 'react';
import { callApi, uploadFileApi } from '../../api/supabaseClient';
import { extractAiText, aiErrorMessage } from './yamenUtils';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

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
    <div className="space-y-4 p-4 bg-najdi-900 rounded-xl border border-najdi-900">
      <div className="text-sm font-semibold text-najdi-100 flex items-center gap-2">
        <FileText className="w-4 h-4 text-najdi-500" />
        {isRTL ? 'معالج المستندات بالذكاء الاصطناعي' : 'AI Document Processor'}
      </div>

      <div className="border-2 border-dashed border-najdi-900 rounded-lg p-6 text-center cursor-pointer hover:border-najdi-500 transition">
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
        <div className="text-xs text-muted-foreground">{isRTL ? 'الملف:' : 'File:'} {selectedFile}</div>
      )}

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700/50 rounded text-red-300 text-sm flex gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3 p-3 bg-emerald-900/20 border border-emerald-700/40 rounded">
          <div className="flex items-center gap-2 text-emerald-400 font-medium text-sm">
            <CheckCircle className="w-4 h-4" />
            {isRTL ? 'تم التحليل' : 'Analysis Complete'}
          </div>

          <div className="space-y-2 text-xs text-muted-foreground">
            <div>
              <span className="text-muted-foreground">{isRTL ? 'نوع المستند:' : 'Type:'}</span>
              <span className="ml-2">{result.documentType}</span>
            </div>

            {result.extractedData && Object.keys(result.extractedData).length > 0 && (
              <div>
                <span className="text-muted-foreground block mb-1">{isRTL ? 'البيانات المستخرجة:' : 'Extracted Data:'}</span>
                <pre className="bg-najdi-900/50 p-2 rounded text-xs overflow-auto max-h-32">
                  {JSON.stringify(result.extractedData, null, 2)}
                </pre>
              </div>
            )}

            {result.complianceIssues?.length > 0 && (
              <div>
                <span className="text-red-400 block mb-1">{isRTL ? 'مشاكل الامتثال:' : 'Issues:'}</span>
                <ul className="list-disc list-inside space-y-1">
                  {result.complianceIssues.map((issue, i) => (
                    <li key={i} className="text-red-300">{issue}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <span className="text-muted-foreground">{isRTL ? 'الحالة:' : 'Status:'}</span>
              <span className={`ml-2 ${result.verificationStatus === 'verified' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {result.verificationStatus}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}