import OpenAI from 'openai';
import { config } from './config.js';

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (config.requestType === 'MOCK') {
    return null;
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

  if (!apiKey) {
    throw new Error(`AI Provider '${config.requestType}' is selected but no API key is configured. Please provide the appropriate API key in your environment.`);
  }

  openaiClient = new OpenAI({
    apiKey,
    baseURL: baseUrl
  });

  return openaiClient;
}

export async function executeLlmCompletion(
  systemPrompt: string,
  userPrompt: string,
  modelOverride?: string,
  temperature = 0.3
): Promise<string> {
  // If explicitly configured for MOCK mode (e.g. testing), run the simulated engine
  if (config.requestType === 'MOCK') {
    return executeSimulatedLlmCompletion(systemPrompt, userPrompt);
  }

  const client = getClient();
  if (!client) {
    throw new Error(`Provider ${config.requestType} client could not be initialized.`);
  }

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

    return content;
  } catch (error: any) {
    console.error(`[ShivQuill LLM] Error calling provider ${config.requestType}:`, error.message || error);
    // Explicitly rethrow provider error to prevent silent mock output to real users
    throw new Error(`AI Provider Error (${config.requestType}): ${error.message || 'Upstream completion failed'}`);
  }
}

function getDefaultModel(): string {
  switch (config.requestType) {
    case 'GROQ':
      return config.groq.model;
    case 'OPENROUTER':
      return config.openrouter.model;
    case 'OPENAI':
      return config.openai.model;
    case 'CUSTOM':
      return config.custom.model;
    default:
      return 'gpt-4o-mini';
  }
}

/**
 * Isolated deterministic mock engine for automated test suites
 */
export function executeSimulatedLlmCompletion(systemPrompt: string, userPrompt: string): string {
  // Grammar check simulation
  if (systemPrompt.includes('JSON object strictly matching this schema') || systemPrompt.includes('proofreader')) {
    const issues: any[] = [];
    let corrected = userPrompt;

    if (userPrompt.includes('teh')) {
      corrected = corrected.replace(/teh/g, 'the');
      issues.push({
        id: 'err-1',
        category: 'spelling',
        original: 'teh',
        replacement: 'the',
        start: userPrompt.indexOf('teh'),
        end: userPrompt.indexOf('teh') + 3,
        explanation: 'Corrected spelling typo: "teh" -> "the".'
      });
    }

    if (userPrompt.includes('is boom')) {
      corrected = corrected.replace(/is boom/g, 'is booming');
      issues.push({
        id: 'err-2',
        category: 'grammar',
        original: 'is boom',
        replacement: 'is booming',
        start: userPrompt.indexOf('is boom'),
        end: userPrompt.indexOf('is boom') + 7,
        explanation: 'Verb form error: use progressive participle "booming".'
      });
    }

    return JSON.stringify({
      correctedText: corrected,
      issues
    });
  }

  // Summarize simulation
  if (systemPrompt.includes('analytical summarizer')) {
    if (systemPrompt.includes('Markdown Bullet Points')) {
      const sentences = userPrompt.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 0);
      return sentences.slice(0, 3).map(s => `• ${s.trim()}`).join('\n');
    }
    const sentences = userPrompt.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 0);
    return sentences.slice(0, 2).join(' ');
  }

  // Translation simulation
  if (systemPrompt.includes('multilingual translator')) {
    return `[Translated]: ${userPrompt}`;
  }

  // Humanize simulation
  if (systemPrompt.includes('humanize')) {
    return userPrompt
      .replace(/Furthermore,/g, 'Also,')
      .replace(/In summary,/g, 'To sum up,')
      .replace(/It is important to remember that/g, 'Remember that')
      .replace(/utilize/g, 'use');
  }

  // Paraphrasing simulation by mode
  if (systemPrompt.includes('academic tone')) {
    return userPrompt
      .replace(/good/gi, 'advantageous')
      .replace(/show/gi, 'demonstrate')
      .replace(/big/gi, 'substantial')
      .replace(/make/gi, 'generate');
  }

  if (systemPrompt.includes('formal tone') || systemPrompt.includes('professional')) {
    return userPrompt
      .replace(/help/gi, 'assist')
      .replace(/need/gi, 'require')
      .replace(/get/gi, 'obtain')
      .replace(/buy/gi, 'purchase');
  }

  if (systemPrompt.includes('plain English') || systemPrompt.includes('simple')) {
    return userPrompt
      .replace(/utilize/gi, 'use')
      .replace(/facilitate/gi, 'help')
      .replace(/substantial/gi, 'large');
  }

  if (systemPrompt.includes('condense') || systemPrompt.includes('shorten')) {
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
