import OpenAI from 'openai';
import { config } from './config.js';

let openaiClient: OpenAI | null = null;

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
    timeout: 60000 // 60s timeout
  });

  return openaiClient;
}

export async function executeLlmCompletion(
  systemPrompt: string,
  userPrompt: string,
  modelOverride?: string,
  temperature = 0.3
): Promise<string> {
  // ZERO-MOCK POLICY: If in production, strictly forbid mock execution
  if (config.env === 'production' && config.requestType === 'MOCK') {
    throw new Error('[ShivQuill Security] ZERO-MOCK POLICY: MOCK execution is forbidden in production.');
  }

  // If explicitly configured for MOCK mode in non-production (e.g. testing), run the simulated engine
  if (config.requestType === 'MOCK') {
    return executeSimulatedLlmCompletion(systemPrompt, userPrompt);
  }

  if (config.requestType === 'UNCONFIGURED') {
    throw new Error(
      'ShivQuill is running in unconfigured mode. To perform live AI operations, ' +
      'please configure a valid provider (e.g. GROQ_API_KEY or OPENAI_API_KEY) in .env, ' +
      'or set REQUEST_TYPE=MOCK for local testing.'
    );
  }

  const client = getClient();
  const model = modelOverride || getDefaultModel();

  try {
    const response = await client.chat.completions.create({
      model,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    let content = response.choices[0]?.message?.content || '';

    // Strip quotation wraps if mistakenly returned
    content = content.trim();
    if (content.startsWith('"') && content.endsWith('"') && (content.match(/"/g) || []).length === 2) {
      content = content.slice(1, -1);
    }

    if (!content) {
      throw new Error('AI Provider returned an empty completion response.');
    }

    return content;
  } catch (error: any) {
    console.error(`[ShivQuill LLM] Error calling provider ${config.requestType}:`, error.message || error);
    // Explicitly rethrow provider error to prevent silent mock output to real users
    throw new Error(`AI Provider Error (${config.requestType}): ${error.message || 'Upstream completion failed'}`);
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
