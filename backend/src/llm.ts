import OpenAI from 'openai';
import { config } from './config.js';

let openaiClient: OpenAI | null = null;

/**
 * Error raised for provider failures. `retryable` is true only for failures the SDK
 * does not already retry itself (e.g. an empty completion), so callers can safely retry those.
 */
export class ProviderError extends Error {
  public readonly status?: number;
  public readonly retryable: boolean;

  constructor(message: string, options: { status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

export class ModelNotAllowedError extends Error {
  constructor(model: string) {
    super(`Model '${model}' is not allowed on this server.`);
    this.name = 'ModelNotAllowedError';
  }
}

/**
 * Returns true if a client-requested model may be used. The provider default is always allowed;
 * anything else must be listed in ALLOWED_MODELS.
 */
export function isModelAllowed(model: string | undefined | null): boolean {
  if (model === undefined || model === null || model === '') return true;
  return model === getDefaultModel() || config.allowedModels.includes(model);
}

function getClient(): OpenAI {
  if (config.requestType === 'MOCK') {
    throw new Error('Attempted to initialize OpenAI client in MOCK mode.');
  }

  if (config.requestType === 'UNCONFIGURED') {
    throw new Error(
      'No AI provider is configured. Please configure a valid provider (e.g. GROQ_API_KEY, OPENAI_API_KEY) in .env, ' +
      'or set REQUEST_TYPE=MOCK strictly for offline test execution.'
    );
  }

  if (openaiClient) {
    return openaiClient;
  }

  let baseUrl = '';
  let apiKey = '';

  switch (config.requestType) {
    case 'GROQ':
      baseUrl = config.groq.baseUrl;
      apiKey = config.groq.apiKey;
      break;
    case 'OPENROUTER':
      baseUrl = config.openrouter.baseUrl;
      apiKey = config.openrouter.apiKey;
      break;
    case 'OPENAI':
      baseUrl = config.openai.baseUrl;
      apiKey = config.openai.apiKey;
      break;
    case 'CUSTOM':
      baseUrl = config.custom.baseUrl;
      apiKey = config.custom.apiKey;
      break;
    default:
      throw new Error(`Unsupported AI Provider: ${config.requestType}`);
  }

  if (!apiKey && config.requestType !== 'CUSTOM') {
    throw new Error(
      `AI Provider '${config.requestType}' is selected but no API key is configured. ` +
      `Please provide the appropriate API key in your environment.`
    );
  }

  openaiClient = new OpenAI({
    apiKey: apiKey || 'dummy-key-for-local-custom-llm',
    baseURL: baseUrl,
    timeout: 60000, // 60s timeout per attempt
    // The SDK retries transient failures (connection errors, 408/409/429/5xx) with backoff.
    // Callers must NOT add their own retry loop for these, or attempts multiply.
    maxRetries: 2
  });

  return openaiClient;
}

const REASONING_MAX_COMPLETION_TOKENS = 16384;

/** Models that emit hidden reasoning tokens before the visible answer. */
export function isReasoningModel(model: string): boolean {
  return /(^|\/)gpt-oss-/i.test(model);
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function executeLlmCompletion(
  systemPrompt: string,
  userPrompt: string,
  modelOverride?: string,
  temperature = 0.3,
  abortSignal?: AbortSignal,
  onToken?: (delta: string) => void
): Promise<string> {
  return executeChatCompletion(systemPrompt, [{ role: 'user', content: userPrompt }], modelOverride, temperature, abortSignal, onToken);
}

/** Emits text in small word groups (used to simulate streaming in MOCK mode). */
function emitInPieces(text: string, onToken: (delta: string) => void) {
  const pieces = text.match(/\S+\s*|\s+/g) || [];
  for (const piece of pieces) onToken(piece);
}

/**
 * Multi-turn completion: sends a system prompt plus real user/assistant turns to the provider.
 */
export async function executeChatCompletion(
  systemPrompt: string,
  conversation: ConversationMessage[],
  modelOverride?: string,
  temperature = 0.3,
  abortSignal?: AbortSignal,
  /** When provided, the completion is streamed and each text delta is passed here as it arrives */
  onToken?: (delta: string) => void
): Promise<string> {
  const lastUser = [...conversation].reverse().find(m => m.role === 'user');
  const userPrompt = lastUser?.content ?? '';

  if (abortSignal?.aborted) {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  // ZERO-MOCK POLICY: If in production, strictly forbid mock execution
  if (config.env === 'production' && config.requestType === 'MOCK') {
    throw new Error('[ShivQuill Security] ZERO-MOCK POLICY: MOCK execution is forbidden in production.');
  }

  // If explicitly configured for MOCK mode in non-production (e.g. testing), run the simulated engine
  if (config.requestType === 'MOCK') {
    if (abortSignal?.aborted) {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    const simulated = executeSimulatedLlmCompletion(systemPrompt, userPrompt);
    if (onToken) emitInPieces(simulated, onToken);
    return simulated;
  }

  if (config.requestType === 'UNCONFIGURED') {
    throw new Error(
      'ShivQuill is running in unconfigured mode. To perform live AI operations, ' +
      'please configure a valid provider (e.g. GROQ_API_KEY or OPENAI_API_KEY) in .env, ' +
      'or set REQUEST_TYPE=MOCK for local testing.'
    );
  }

  if (!isModelAllowed(modelOverride)) {
    throw new ModelNotAllowedError(modelOverride as string);
  }

  const client = getClient();
  const model = modelOverride || getDefaultModel();
  let emptyCompletion = false;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...conversation.map(m => ({ role: m.role, content: m.content }))
  ];

  // Reasoning models (e.g. openai/gpt-oss-*) spend output tokens on hidden reasoning before
  // the answer. Keep reasoning light and leave a generous output budget so the visible answer
  // is not starved, which otherwise surfaces as an empty completion.
  const reasoningParams = isReasoningModel(model)
    ? { reasoning_effort: 'low' as const, max_completion_tokens: REASONING_MAX_COMPLETION_TOKENS }
    : {};

  const requestOnce = async (): Promise<string> => {
    let text = '';
    if (onToken) {
      const stream = await client.chat.completions.create(
        { model, temperature, messages, stream: true, ...reasoningParams },
        { signal: abortSignal }
      );
      for await (const part of stream) {
        const delta = part.choices[0]?.delta?.content || '';
        if (delta) {
          text += delta;
          onToken(delta);
        }
      }
    } else {
      const response = await client.chat.completions.create(
        { model, temperature, messages, ...reasoningParams },
        { signal: abortSignal }
      );
      text = response.choices[0]?.message?.content || '';
    }
    return text;
  };

  try {
    let content = await requestOnce();
    // An empty answer emitted nothing to the stream, so one retry is safe and invisible to the user.
    if (!content.trim() && !abortSignal?.aborted) {
      console.warn(`[ShivQuill LLM] Empty completion from '${model}', retrying once...`);
      content = await requestOnce();
    }

    // Strip quotation wraps if mistakenly returned
    content = content.trim();
    if (content.startsWith('"') && content.endsWith('"') && (content.match(/"/g) || []).length === 2) {
      content = content.slice(1, -1);
    }

    if (!content) {
      emptyCompletion = true;
      throw new Error('AI Provider returned an empty completion response.');
    }

    return content;
  } catch (error: any) {
    if (error.name === 'AbortError' || abortSignal?.aborted || error.message?.includes('aborted')) {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    // Automatic fallback for Groq when 70B model access is unavailable on the account
    if (
      config.requestType === 'GROQ' &&
      model !== 'openai/gpt-oss-120b' &&
      (error?.status === 404 || String(error?.message).includes('does not exist or you do not have access'))
    ) {
      console.warn(
        `[ShivQuill LLM] Groq model '${model}' is unavailable (404, possibly retired). Falling back to 'openai/gpt-oss-120b'...`
      );
      return executeChatCompletion(systemPrompt, conversation, 'openai/gpt-oss-120b', temperature, abortSignal, onToken);
    }

    console.error(`[ShivQuill LLM] Error calling provider ${config.requestType}:`, error.message || error);
    // Explicitly rethrow provider error to prevent silent mock output to real users.
    // Transport/HTTP failures were already retried by the SDK, so only an empty completion is retryable.
    throw new ProviderError(
      `AI Provider Error (${config.requestType}): ${error.message || 'Upstream completion failed'}`,
      { status: typeof error.status === 'number' ? error.status : undefined, retryable: emptyCompletion }
    );
  }
}

export function getDefaultModel(): string {
  switch (config.requestType) {
    case 'GROQ':
      return config.groq.model;
    case 'OPENROUTER':
      return config.openrouter.model;
    case 'OPENAI':
      return config.openai.model;
    case 'CUSTOM':
      return config.custom.model;
    case 'MOCK':
      return 'mock-simulator';
    default:
      return 'unconfigured';
  }
}

/**
 * Isolated deterministic mock engine strictly for automated test suites
 */
export function executeSimulatedLlmCompletion(systemPrompt: string, userPrompt: string): string {
  if (config.env === 'production') {
    throw new Error('[ShivQuill Security] ZERO-MOCK POLICY: Simulated LLM completion cannot run in production.');
  }

  // Sentence alternatives simulation
  if (systemPrompt.includes('SENTENCE ALTERNATIVES')) {
    const base = userPrompt.trim().replace(/[.!?]+$/, '');
    return JSON.stringify({
      alternatives: [
        `${base.replace(/\bimportant\b/gi, 'vital').replace(/\bhelp\b/gi, 'assist')}.`,
        `In short, ${base.charAt(0).toLowerCase()}${base.slice(1)}.`,
        `${base}, as noted.`
      ]
    });
  }

  // Tone analysis simulation
  if (systemPrompt.includes('TONE ANALYST')) {
    const formal = /\b(furthermore|therefore|consequently|regarding|hereby)\b/i.test(userPrompt);
    return JSON.stringify({
      primaryTone: formal ? 'Formal' : 'Neutral',
      tones: [
        { name: formal ? 'Formal' : 'Neutral', score: 72 },
        { name: 'Confident', score: 55 },
        { name: 'Friendly', score: 30 }
      ],
      formality: formal ? 80 : 50,
      sentiment: 'neutral',
      confidence: 60,
      summary: formal ? 'Reads as formal and businesslike.' : 'Reads as balanced and matter-of-fact.'
    });
  }

  // Tone rewrite simulation
  if (systemPrompt.includes('TONE REWRITER')) {
    return userPrompt.replace(/\bdon't\b/gi, 'do not').replace(/\bget\b/gi, 'obtain');
  }

  // Writing Suggestions simulation
  if (systemPrompt.includes('expert prose and writing editor') || systemPrompt.includes('ACTIONABLE WRITING SUGGESTIONS')) {
    const suggestions: any[] = [];
    if (userPrompt.toLowerCase().includes('in order to')) {
      const idx = userPrompt.toLowerCase().indexOf('in order to');
      suggestions.push({
        id: 'sug-1',
        type: 'conciseness',
        originalText: 'in order to',
        suggestedText: 'to',
        explanation: 'Simplify wordy phrase "in order to" to direct verb infinitive "to".',
        start: idx,
        end: idx + 11
      });
    }
    if (userPrompt.toLowerCase().includes('very important')) {
      const idx = userPrompt.toLowerCase().indexOf('very important');
      suggestions.push({
        id: 'sug-2',
        type: 'vocabulary',
        originalText: 'very important',
        suggestedText: 'critical',
        explanation: 'Elevate weak modifier "very important" to precise adjective "critical".',
        start: idx,
        end: idx + 14
      });
    }
    return JSON.stringify({ suggestions });
  }

  // Grammar check simulation
  if (systemPrompt.includes('JSON object strictly matching this TypeScript interface') || systemPrompt.includes('proofreader')) {
    const issues: any[] = [];
    let corrected = userPrompt;

    if (userPrompt.includes('teh')) {
      const idx = userPrompt.indexOf('teh');
      corrected = corrected.replace(/teh/g, 'the');
      issues.push({
        id: 'err-1',
        category: 'spelling',
        original: 'teh',
        replacement: 'the',
        start: idx,
        end: idx + 3,
        explanation: 'Corrected spelling typo: "teh" -> "the".'
      });
    }

    if (userPrompt.includes('is boom')) {
      const idx = userPrompt.indexOf('is boom');
      corrected = corrected.replace(/is boom/g, 'is booming');
      issues.push({
        id: 'err-2',
        category: 'grammar',
        original: 'is boom',
        replacement: 'is booming',
        start: idx,
        end: idx + 7,
        explanation: 'Verb form error: use progressive participle "booming".'
      });
    }

    return JSON.stringify({
      correctedText: corrected,
      issues
    });
  }

  // Summarize simulation
  if (systemPrompt.includes('analytical research summarizer') || systemPrompt.includes('analytical summarizer')) {
    if (systemPrompt.includes('Markdown Bullet Points')) {
      const sentences = userPrompt.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 0);
      return sentences.slice(0, 3).map(s => `• ${s.trim()}`).join('\n');
    }
    const sentences = userPrompt.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 0);
    return sentences.slice(0, 2).join(' ');
  }

  // Translation simulation
  if (systemPrompt.includes('multilingual translator') || systemPrompt.includes('culturally fluent translator')) {
    return `[Translated]: ${userPrompt}`;
  }

  // Humanize simulation
  if (systemPrompt.includes('humanize') || systemPrompt.includes('prose stylist')) {
    return userPrompt
      .replace(/Furthermore,/g, 'Also,')
      .replace(/In summary,/g, 'To sum up,')
      .replace(/It is important to remember that/g, 'Remember that')
      .replace(/utilize/g, 'use');
  }

  // Paraphrasing simulation by mode
  if (systemPrompt.includes('academic register') || systemPrompt.includes('academic tone')) {
    return userPrompt
      .replace(/\bgood\b/gi, 'advantageous')
      .replace(/\bshow\b/gi, 'demonstrate')
      .replace(/\bbig\b/gi, 'substantial')
      .replace(/\bmake\b/gi, 'generate');
  }

  if (systemPrompt.includes('professional') || systemPrompt.includes('authoritative')) {
    return userPrompt
      .replace(/\bhelp\b/gi, 'assist')
      .replace(/\bneed\b/gi, 'require')
      .replace(/\bget\b/gi, 'obtain')
      .replace(/\bbuy\b/gi, 'purchase');
  }

  if (systemPrompt.includes('plain English') || systemPrompt.includes('simple')) {
    return userPrompt
      .replace(/\butilize\b/gi, 'use')
      .replace(/\bfacilitate\b/gi, 'help')
      .replace(/\bsubstantial\b/gi, 'large');
  }

  if (systemPrompt.includes('condense') || systemPrompt.includes('shorten') || systemPrompt.includes('economical prose')) {
    const sentences = userPrompt.split(/(?<=[.?!])\s+/);
    return sentences.slice(0, Math.max(1, Math.ceil(sentences.length * 0.7))).join(' ');
  }

  // Standard rewrite default
  return userPrompt
    .replace(/\bbig\b/gi, 'large')
    .replace(/\bhelp\b/gi, 'assist')
    .replace(/\bmake\b/gi, 'create')
    .replace(/\bimportant\b/gi, 'vital');
}
