import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  // Mirror the provider resolution in routes/ai.ts: honour AI_PROVIDER, else
  // auto-detect in priority order. Kept dependency-light on purpose.
  const have: Record<string, boolean> = {
    gemini: !!(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.Gemini_EduSaga360),
    claude: !!process.env.ANTHROPIC_API_KEY,
    groq:   !!process.env.GROQ_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
  };
  const override = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  const order = override ? [override] : ['gemini', 'claude', 'groq', 'openai'];
  const active = order.find((p) => have[p])
    ?? (override ? `${override} (key missing)` : 'none');

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    ai_provider: active,
    ai_provider_override: override || null,
  });
});
