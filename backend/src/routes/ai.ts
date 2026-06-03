import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';

export const aiRouter = Router();

const SUPPORTED_PROVIDERS = ['google', 'openai', 'groq'] as const;

function getProvider(): { name: string; apiKey: string; endpoint: string; model: string } | null {
  if (process.env.GOOGLE_AI_API_KEY) {
    return {
      name: 'google',
      apiKey: process.env.GOOGLE_AI_API_KEY,
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      model: 'gemini-2.0-flash',
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      name: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
    };
  }
  if (process.env.GROQ_API_KEY) {
    return {
      name: 'groq',
      apiKey: process.env.GROQ_API_KEY,
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'llama-3.3-70b-versatile',
    };
  }
  return null;
}

async function callGoogle(apiKey: string, endpoint: string, prompt: string): Promise<string> {
  const res = await fetch(`${endpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google AI error (${res.status}): ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
}

async function callOpenAICompatible(
  apiKey: string, endpoint: string, model: string, prompt: string,
): Promise<string> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2048,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI API error (${res.status}): ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || 'No response generated.';
}

aiRouter.post('/invoke-llm', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    const provider = getProvider();
    if (!provider) {
      return res.status(200).json(
        'عذراً، خدمة الذكاء الاصطناعي غير مُفعّلة حالياً. يرجى التواصل مع مدير النظام لإضافة مفتاح API.\n\n' +
        'AI service is not configured. Please contact your system administrator to set up an AI API key ' +
        '(GOOGLE_AI_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY).',
      );
    }

    let response: string;
    if (provider.name === 'google') {
      response = await callGoogle(provider.apiKey, provider.endpoint, prompt);
    } else {
      response = await callOpenAICompatible(
        provider.apiKey, provider.endpoint, provider.model, prompt,
      );
    }

    res.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown AI error';
    console.error('AI invoke-llm error:', message);
    res.status(500).json({ error: message });
  }
});
