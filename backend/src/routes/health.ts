import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    ai_provider: process.env.GOOGLE_AI_API_KEY ? 'gemini (GOOGLE_AI_API_KEY)'
      : process.env.GEMINI_API_KEY ? 'gemini (GEMINI_API_KEY)'
      : process.env.Gemini_EduSaga360 ? 'gemini (Gemini_EduSaga360)'
      : process.env.ANTHROPIC_API_KEY ? 'claude'
      : 'none',
  });
});
