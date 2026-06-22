import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    ai_provider: process.env.GOOGLE_AI_API_KEY ? 'gemini'
      : process.env.GEMINI_API_KEY ? 'gemini (alias)'
      : process.env.ANTHROPIC_API_KEY ? 'claude'
      : 'none',
  });
});
