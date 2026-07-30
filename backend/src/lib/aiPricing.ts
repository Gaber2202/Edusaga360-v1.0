/**
 * Approximate provider/model token rates in USD per 1M tokens.
 * Used to estimate Yamen AI spend server-side. Rates should be refreshed
 * periodically as provider pricing changes.
 */

export interface ModelRate {
  inputPer1M: number;
  outputPer1M: number;
}

const RATES: Record<string, ModelRate> = {
  // Google Gemini
  'gemini-2.0-flash': { inputPer1M: 0.10, outputPer1M: 0.40 },
  'gemini-2.5-flash': { inputPer1M: 0.30, outputPer1M: 2.50 },
  'gemini-2.5-flash-lite': { inputPer1M: 0.10, outputPer1M: 0.40 },
  'gemini-2.5-pro': { inputPer1M: 1.25, outputPer1M: 10.00 },
  'gemini-3.1-pro': { inputPer1M: 2.00, outputPer1M: 12.00 },
  'gemini-3-flash': { inputPer1M: 0.50, outputPer1M: 3.00 },

  // Anthropic Claude
  'claude-sonnet-4-6': { inputPer1M: 1.50, outputPer1M: 7.50 },
  'claude-sonnet-4-5': { inputPer1M: 1.50, outputPer1M: 7.50 },
  'claude-sonnet-4': { inputPer1M: 1.50, outputPer1M: 7.50 },
  'claude-sonnet-3-5': { inputPer1M: 3.00, outputPer1M: 15.00 },
  'claude-3-5-haiku': { inputPer1M: 0.80, outputPer1M: 4.00 },
  'claude-haiku-4-5': { inputPer1M: 0.50, outputPer1M: 2.50 },

  // Groq Llama
  'llama-3.3-70b-versatile': { inputPer1M: 0.59, outputPer1M: 0.79 },
  'llama-3.1-70b-versatile': { inputPer1M: 0.59, outputPer1M: 0.79 },
  'llama-3-70b-8192': { inputPer1M: 0.59, outputPer1M: 0.79 },

  // OpenAI
  'gpt-4o': { inputPer1M: 2.50, outputPer1M: 10.00 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.60 },
  'gpt-4.1-mini': { inputPer1M: 0.40, outputPer1M: 1.60 },
  'gpt-4.1': { inputPer1M: 2.00, outputPer1M: 8.00 },
};

const DEFAULT: ModelRate = {
  inputPer1M: Number(process.env.AI_DEFAULT_INPUT_RATE_PER_1M || 1.0),
  outputPer1M: Number(process.env.AI_DEFAULT_OUTPUT_RATE_PER_1M || 3.0),
};

function normalizeModel(model: string): string {
  return model.toLowerCase().replace(/[:\s_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function getModelRate(model: string): ModelRate {
  if (!model) return DEFAULT;
  const normalized = normalizeModel(model);
  if (RATES[normalized]) return RATES[normalized];
  // Try a few common aliases / prefixes.
  for (const [key, rate] of Object.entries(RATES)) {
    if (normalized.includes(key) || key.includes(normalized)) return rate;
  }
  return DEFAULT;
}

export function calculateCost(inputTokens: number, outputTokens: number, model?: string): number {
  const rate = getModelRate(model || '');
  const inputCost = (Math.max(0, inputTokens) * rate.inputPer1M) / 1_000_000;
  const outputCost = (Math.max(0, outputTokens) * rate.outputPer1M) / 1_000_000;
  return Number((inputCost + outputCost).toFixed(6));
}
