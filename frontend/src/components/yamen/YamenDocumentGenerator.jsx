import React, { useState } from 'react';
import { callApi } from '../../api/supabaseClient';
import { extractAiText } from './yamenUtils';
import { Button } from '../ui/button';
import { FileText, Copy, Download, Loader2, CheckCircle } from 'lucide-react';
import { documentTemplates } from './yamenUtils';
import { YamenSection } from './YamenShellParts';
import { yamenLayout } from '../../lib/yamenDesign';

export default function YamenDocumentGenerator({ isRTL }) {
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [variables, setVariables] = useState({});
  const [generatedDoc, setGeneratedDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleVariableChange = (key, value) => {
    setVariables(prev => ({ ...prev, [key]: value }));
  };

  const generateDocument = async () => {
    if (!selectedTemplate) return;

    setLoading(true);
    const template = documentTemplates[selectedTemplate];
    let doc = template.template;

    // Replace variables
    Object.entries(variables).forEach(([key, value]) => {
      doc = doc.replaceAll(`{${key}}`, value || '');
    });

    try {
      // Optional: Use Gemini to enhance the document
      const enhancedPrompt = `Refine this HR document to be more professional and ensure Saudi labor law compliance:\n\n${doc}\n\nRespond with the refined document only.`;

      const enhanced = await callApi('/api/ai/invoke-llm', {
        prompt: enhancedPrompt,
        source: 'documents',
        model: 'gemini_3_pro',
      });

      setGeneratedDoc(extractAiText(enhanced) || doc);
    } catch (err) {
      console.error('Generation error:', err);
      setGeneratedDoc(doc);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedDoc);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadAsFile = () => {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(generatedDoc));
    element.setAttribute('download', `document-${Date.now()}.txt`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  if (generatedDoc) {
    return (
      <div className={yamenLayout.page}>
        <YamenSection
          title={isRTL ? 'تم الإنشاء' : 'Document Generated'}
          icon={CheckCircle}
          action={(
            <button
              onClick={() => setGeneratedDoc(null)}
              className="text-xs text-muted-foreground hover:text-ink"
            >
              {isRTL ? 'جديد' : 'New'}
            </button>
          )}
        >
          <div className="bg-sand-alt/50 border border-border/50 p-3 rounded-lg text-sm text-ink whitespace-pre-wrap max-h-64 overflow-y-auto">
            {generatedDoc}
          </div>

          <div className="flex gap-2 mt-3">
            <Button
              onClick={copyToClipboard}
              size="sm"
              variant="outline"
              className="text-xs"
            >
              <Copy className="w-3 h-3 mr-1" />
              {copied ? (isRTL ? 'تم النسخ' : 'Copied') : (isRTL ? 'نسخ' : 'Copy')}
            </Button>
            <Button
              onClick={downloadAsFile}
              size="sm"
              variant="outline"
              className="text-xs"
            >
              <Download className="w-3 h-3 mr-1" />
              {isRTL ? 'تحميل' : 'Download'}
            </Button>
          </div>
        </YamenSection>
      </div>
    );
  }

  if (selectedTemplate) {
    const template = documentTemplates[selectedTemplate];
    return (
      <div className={yamenLayout.page}>
        <YamenSection
          title={template.name}
          subtitle={isRTL ? 'أدخل المتغيرات ثم أنشئ المستند' : 'Fill variables, then generate the document'}
          icon={FileText}
          action={(
            <button
              onClick={() => setSelectedTemplate(null)}
              className="text-xs text-muted-foreground hover:text-ink"
            >
              {isRTL ? 'رجوع' : 'Back'}
            </button>
          )}
        >
          <div className="space-y-2">
            {template.variables.map(varName => (
              <div key={varName}>
                <label className="text-xs text-muted-foreground block mb-1">
                  {varName.charAt(0).toUpperCase() + varName.slice(1)}
                </label>
                <input
                  type="text"
                  value={variables[varName] || ''}
                  onChange={(e) => handleVariableChange(varName, e.target.value)}
                  className="w-full px-2 py-1.5 bg-white border border-border rounded-lg text-xs text-ink placeholder:text-muted-foreground"
                  placeholder={`Enter ${varName}...`}
                />
              </div>
            ))}
          </div>

          <Button
            onClick={generateDocument}
            disabled={loading || template.variables.some(v => !variables[v])}
            className="w-full text-xs mt-3"
          >
            {loading ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                {isRTL ? 'جاري الإنشاء...' : 'Generating...'}
              </>
            ) : (
              <>
                <FileText className="w-3 h-3 mr-1" />
                {isRTL ? 'إنشاء المستند' : 'Generate'}
              </>
            )}
          </Button>
        </YamenSection>
      </div>
    );
  }

  return (
    <div className={yamenLayout.page}>
      <YamenSection
        title={isRTL ? 'إنشاء خطابات الموارد' : 'Generate HR Letters'}
        subtitle={isRTL ? 'اختر قالباً لبدء الإنشاء' : 'Select a template to get started'}
        icon={FileText}
      >
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(documentTemplates).map(([key, template]) => (
            <button
              key={key}
              onClick={() => setSelectedTemplate(key)}
              className="p-3 bg-sand-alt/40 hover:bg-najdi-50 border border-border/60 hover:border-najdi-300 rounded-xl text-xs text-ink text-start transition"
            >
              <FileText className="w-3.5 h-3.5 mb-1.5 text-najdi-700" />
              <div className="font-medium">{template.name}</div>
            </button>
          ))}
        </div>
      </YamenSection>
    </div>
  );
}