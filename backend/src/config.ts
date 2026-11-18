import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// The project-root .env (written by `npm run setup:keys`) is the single source of truth, whether the
// server is started from the root (npm start) or from backend/ (npm run dev). Earlier files win;
// real environment variables (e.g. the Render dashboard) always win over any file.
const here = path.dirname(fileURLToPath(import.meta.url));
for (const file of [path.resolve(here, '../../.env'), path.resolve(here, '../.env'), path.resolve(process.cwd(), '.env')]) {
  dotenv.config({ path: file });
}

export type RequestType = 'GROQ' | 'OPENROUTER' | 'OPENAI' | 'CUSTOM' | 'MOCK' | 'UNCONFIGURED';

const nodeEnv = process.env.NODE_ENV || 'development';
const explicitRequestType = process.env.REQUEST_TYPE ? process.env.REQUEST_TYPE.toUpperCase() as RequestType : undefined;

function resolveRequestType(): RequestType {
  // The test suite never spends real API credit just because keys are saved in .env;
  // opt in explicitly with LIVE_PROVIDER_TESTS=1
  if (nodeEnv === 'test' && process.env.LIVE_PROVIDER_TESTS !== '1') return 'MOCK';

  // ZERO-MOCK POLICY: Production environments unconditionally reject MOCK
  if (explicitRequestType === 'MOCK') {
    if (nodeEnv === 'production') {
      throw new Error(
        '[ShivQuill Security] ZERO-MOCK POLICY VIOLATION: REQUEST_TYPE=MOCK is strictly forbidden in production. ' +
        'ShivQuill requires a legitimate configured AI provider (GROQ, OPENAI, OPENROUTER, or CUSTOM).'
      );
    }
    return 'MOCK';
  }

  if (explicitRequestType) {
    return explicitRequestType;
  }

  // Auto-detect based on available API keys if not explicitly specified
  if (process.env.GROQ_API_KEY) return 'GROQ';
  if (process.env.OPENAI_API_KEY) return 'OPENAI';
  if (process.env.OPENROUTER_API_KEY) return 'OPENROUTER';
  if (process.env.CUSTOM_API_KEY || process.env.CUSTOM_API_BASE_URL) return 'CUSTOM';

  // In test environment, allow MOCK only if explicitly in test runner
  if (nodeEnv === 'test') {
    return 'MOCK';
  }

  // In production, failure to configure an AI provider is a fatal error
  if (nodeEnv === 'production') {
    throw new Error(
      '[ShivQuill Startup Error] No AI provider configured in production. ' +
      'Please configure GROQ_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, or CUSTOM_API_BASE_URL.'
    );
  }

  // In development, mark as UNCONFIGURED rather than silently defaulting to MOCK
  return 'UNCONFIGURED';
}

/** Default Groq model, also used when a configured Groq model returns 404 (e.g. retired). */
export const GROQ_FALLBACK_MODEL = 'openai/gpt-oss-120b';

/**
 * Number of reverse-proxy hops to trust for client IPs. Trusting a hop that doesn't exist lets clients
 * spoof X-Forwarded-For and dodge per-IP rate limits, so only default to 1 on Render (which sets RENDER).
 */
function parseTrustProxy(raw: string | undefined): number {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === '') return process.env.RENDER ? 1 : 0;
  if (v === 'true') return 1;
  if (v === 'false') return 0;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export const config = {
  env: nodeEnv,
  port: (() => {
    const p = parseInt(process.env.PORT || '5000', 10);
    return Number.isInteger(p) && p > 0 && p < 65536 ? p : 5000;
  })(),
  // Off with false/0/no/off (any case); never online in the test suite
  plagiarismOnline: !/^(false|0|no|off)$/i.test((process.env.PLAGIARISM_ONLINE || '').trim()) && nodeEnv !== 'test',
  // Comma-separated list of extra allowed origins (the server's own host is always allowed)
  corsOrigins: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(o => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  aiRequestsPerMinute: Math.max(1, parseInt(process.env.AI_REQUESTS_PER_MINUTE || (nodeEnv === 'test' ? '10000' : '30'), 10) || 30),
  corpusAdminApiKey: process.env.CORPUS_ADMIN_KEY || '',
  requestType: resolveRequestType(),
  sentencesInPrompt: Math.max(1, parseInt(process.env.SENTENCES_IN_PROMPT || '3', 10) || 3),
  // Maximum characters sent to the provider in a single completion request.
  // Larger inputs are split into paragraph-aligned batches.
  maxCharsPerRequest: Math.max(1000, parseInt(process.env.MAX_CHARS_PER_REQUEST || '12000', 10) || 12000),
  // Comma-separated list of model IDs clients may request via the `model` field.
  // The provider's default model is always allowed.
  allowedModels: [
    // The Groq 404 fallback model (see llm.ts) must always be callable on Groq
    ...(process.env.GROQ_API_KEY ? [GROQ_FALLBACK_MODEL] : []),
    ...(process.env.ALLOWED_MODELS || '').split(',').map(m => m.trim()).filter(Boolean)
  ],

  // Provider configs
  custom: {
    baseUrl: process.env.CUSTOM_API_BASE_URL || '',
    apiKey: process.env.CUSTOM_API_KEY || '',
    model: process.env.CUSTOM_API_MODEL || 'default'
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || GROQ_FALLBACK_MODEL
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct'
  },
  openai: {
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
  }
};

/**
 * Validates that the active provider has valid credentials
 */
export function validateProviderConfiguration(): { ready: boolean; provider: RequestType; message: string } {
  if (config.requestType === 'MOCK') {
    if (config.env === 'production') {
      return {
        ready: false,
        provider: 'MOCK',
        message: 'CRITICAL SECURITY ERROR: MOCK mode is strictly prohibited in production.'
      };
    }
    return {
      ready: true,
      provider: 'MOCK',
      message: 'Running in simulated MOCK mode (automated testing only).'
    };
  }

  if (config.requestType === 'UNCONFIGURED') {
    return {
      ready: false,
      provider: 'UNCONFIGURED',
      message: 'No AI provider is configured. Please provide an API key in .env or configure a provider.'
    };
  }

  let hasKey = false;
  switch (config.requestType) {
    case 'GROQ':
      hasKey = !!config.groq.apiKey;
      break;
    case 'OPENAI':
      hasKey = !!config.openai.apiKey;
      break;
    case 'OPENROUTER':
      hasKey = !!config.openrouter.apiKey;
      break;
    case 'CUSTOM':
      hasKey = !!(config.custom.apiKey || config.custom.baseUrl);
      break;
  }

  if (!hasKey) {
    return {
      ready: false,
      provider: config.requestType,
      message: `AI provider '${config.requestType}' is selected but required credentials are missing.`
    };
  }

  return {
    ready: true,
    provider: config.requestType,
    message: `AI provider '${config.requestType}' is configured and ready.`
  };
}

/**
 * Asserts production readiness before listening on port
 */
export function assertProductionReadiness(): void {
  if (config.env === 'production') {
    if (config.requestType === 'MOCK' || config.requestType === 'UNCONFIGURED') {
      throw new Error(`[ShivQuill Production Assertion Failed] Cannot start production server with provider '${config.requestType}'.`);
    }
    const val = validateProviderConfiguration();
    if (!val.ready) {
      throw new Error(`[ShivQuill Production Assertion Failed] ${val.message}`);
    }
  }
}
