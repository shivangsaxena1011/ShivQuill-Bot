import OpenAI from 'openai';
import { config, GROQ_FALLBACK_MODEL } from './config.js';

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

  // Without a base URL the SDK silently targets api.openai.com, which would send a custom key to OpenAI
  if (config.requestType === 'CUSTOM' && !baseUrl) {
    throw new Error('CUSTOM provider selected but CUSTOM_API_BASE_URL is not configured.');
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

/** Groq-hosted models that would otherwise put `<think>...</think>` reasoning inside the content. */
function emitsThinkTags(model: string): boolean {
  return /qwen3|qwq|deepseek-r1/i.test(model);
}

/** Thrown when the provider stopped before finishing the answer (token limit or content filter). */
export class IncompleteCompletionError extends Error {
  constructor(public readonly finishReason: string) {
    super(
      finishReason === 'length'
        ? 'The AI response was cut off because it was too long. Try a shorter selection.'
        : `The AI provider stopped the response early (${finishReason}).`
    );
    this.name = 'IncompleteCompletionError';
  }
}

export interface CompletionOptions {
  /**
   * Ask the provider for a strict JSON object (OpenAI-compatible `response_format: json_object`).
   * The caller must still parse defensively; see jsonExtract.ts.
   */
  json?: boolean;
}

/** Providers known to accept `response_format: { type: 'json_object' }`. */
function supportsJsonMode(): boolean {
  return config.requestType === 'GROQ' || config.requestType === 'OPENAI' || config.requestType === 'OPENROUTER';
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
  onToken?: (delta: string) => void,
  options: CompletionOptions = {}
): Promise<string> {
  return executeChatCompletion(systemPrompt, [{ role: 'user', content: userPrompt }], modelOverride, temperature, abortSignal, onToken, options);
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
  onToken?: (delta: string) => void,
  options: CompletionOptions = {}
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
  const reasoningParams: Record<string, unknown> = isReasoningModel(model)
    ? { reasoning_effort: 'low', max_completion_tokens: REASONING_MAX_COMPLETION_TOKENS }
    : config.requestType === 'GROQ' && emitsThinkTags(model)
      ? { reasoning_format: 'hidden' }
      : {};
  const formatParams = options.json && supportsJsonMode()
    ? { response_format: { type: 'json_object' as const } }
    : {};

  let finishReason: string | null | undefined;

  const requestOnce = async (): Promise<string> => {
    let text = '';
    finishReason = undefined;
    if (onToken) {
      const stream = await client.chat.completions.create(
        { model, temperature, messages, stream: true, ...reasoningParams, ...formatParams },
        { signal: abortSignal }
      );
      for await (const part of stream) {
        if (part.choices[0]?.finish_reason) finishReason = part.choices[0].finish_reason;
        const delta = part.choices[0]?.delta?.content || '';
        if (delta) {
          text += delta;
          onToken(delta);
        }
      }
    } else {
      const response = await client.chat.completions.create(
        { model, temperature, messages, ...reasoningParams, ...formatParams },
        { signal: abortSignal }
      );
      text = response.choices[0]?.message?.content || '';
      finishReason = response.choices[0]?.finish_reason;
    }
    return text;
  };

  try {
    let content: string;
    try {
      content = await requestOnce();
    } catch (err: any) {
      // In JSON mode Groq rejects output that is not strictly valid JSON (400 json_validate_failed)
      // but returns the generation itself; hand it to the caller's tolerant parser instead of failing.
      const failed = err?.error?.failed_generation ?? err?.error?.error?.failed_generation;
      if (options.json && err?.status === 400 && typeof failed === 'string' && failed.trim()) {
        console.warn(`[ShivQuill LLM] '${model}' produced invalid strict JSON; using its raw generation.`);
        content = failed;
      } else {
        throw err;
      }
    }
    // An empty answer emitted nothing to the stream, so one retry is safe and invisible to the user.
    if (!content.trim() && !abortSignal?.aborted) {
      console.warn(`[ShivQuill LLM] Empty completion from '${model}', retrying once...`);
      content = await requestOnce();
    }

    // A cut-off answer would silently drop the end of a chunk, so it must not pass as success
    if (finishReason === 'length' || finishReason === 'content_filter') {
      throw new IncompleteCompletionError(finishReason);
    }

    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // Strip quotation wraps the model added, but keep them when the input itself was a quotation
    const inputQuoted = /^\s*["“].*["”]\s*$/s.test(userPrompt);
    if (!options.json && !inputQuoted && content.startsWith('"') && content.endsWith('"') && (content.match(/"/g) || []).length === 2) {
      content = content.slice(1, -1);
    }

    if (!content) {
      // Already retried once above; another retry by the caller would only multiply calls
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

    if (error instanceof IncompleteCompletionError) {
      console.warn(`[ShivQuill LLM] '${model}' stopped early: finish_reason=${error.finishReason}`);
      throw new ProviderError(error.message, { retryable: false });
    }

    // Automatic fallback for Groq when the configured model is unavailable (e.g. retired, 404)
    if (
      config.requestType === 'GROQ' &&
      model !== GROQ_FALLBACK_MODEL &&
      (error?.status === 404 || String(error?.message).includes('does not exist or you do not have access'))
    ) {
      console.warn(
        `[ShivQuill LLM] Groq model '${model}' is unavailable (404, possibly retired). Falling back to '${GROQ_FALLBACK_MODEL}'...`
      );
      return executeChatCompletion(systemPrompt, conversation, GROQ_FALLBACK_MODEL, temperature, abortSignal, onToken, options);
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
