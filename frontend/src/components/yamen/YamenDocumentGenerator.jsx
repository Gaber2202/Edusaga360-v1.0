import React, { useState } from 'react';
import { callApi } from '../../api/supabaseClient';
import { extractAiText } from './yamenUtils';
import { Button } from '../ui/button';
import { FileText, Copy, Download, Loader2, CheckCircle } from 'lucide-react';
import { documentTemplates } from './yamenUtils';

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
      <div className="space-y-3 p-4 bg-slate-900 rounded-xl border border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm font-semibold">{isRTL ? 'تم الإنشاء' : 'Document Generated'}</span>
          </div>
          <button
            onClick={() => setGeneratedDoc(null)}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            {isRTL ? 'جديد' : 'New'}
          </button>
        </div>

        <div className="bg-slate-800 p-3 rounded text-sm text-slate-200 whitespace-pre-wrap max-h-64 overflow-y-auto">
          {generatedDoc}
        </div>

        <div className="flex gap-2">
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
      </div>
    );
  }

  if (selectedTemplate) {
    const template = documentTemplates[selectedTemplate];
    return (
      <div className="space-y-3 p-4 bg-slate-900 rounded-xl border border-slate-700">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">{template.name}</h3>
          <button
            onClick={() => setSelectedTemplate(null)}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            {isRTL ? 'رجوع' : 'Back'}
          </button>
        </div>

        <div className="space-y-2">
          {template.variables.map(varName => (
            <div key={varName}>
              <label className="text-xs text-slate-400 block mb-1">
                {varName.charAt(0).toUpperCase() + varName.slice(1)}
              </label>
              <input
                type="text"
                value={variables[varName] || ''}
                onChange={(e) => handleVariableChange(varName, e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 placeholder:text-slate-600"
                placeholder={`Enter ${varName}...`}
              />
            </div>
          ))}
        </div>

        <Button
          onClick={generateDocument}
          disabled={loading || template.variables.some(v => !variables[v])}
          className="w-full text-xs"
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
      </div>
    );
  }

  return (
    <div className="space-y-2 p-4 bg-slate-900 rounded-xl border border-slate-700">
      <div className="text-sm font-semibold text-slate-200 mb-3">{isRTL ? 'اختر قالب' : 'Select Template'}</div>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(documentTemplates).map(([key, template]) => (
          <button
            key={key}
            onClick={() => setSelectedTemplate(key)}
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs text-slate-200 text-left transition"
          >
            <FileText className="w-3 h-3 mb-1 text-blue-400" />
            <div className="font-medium">{template.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}