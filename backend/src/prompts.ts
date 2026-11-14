import { ParaphraseMode, SynonymStrength } from './types.js';

export const INVARIANCE_RULES = `
CRITICAL INVARIANCE REQUIREMENTS:
1. Preserve all factual claims, numerical values, dates, percentages, and measurements exactly as in the original.
2. Preserve proper nouns, person names, company names, and geographic locations.
3. Preserve citations, author references (e.g. "Smith et al., 2021", "[12]"), and URLs.
4. Preserve verbatim text enclosed in double quotation marks unless instructed otherwise.
5. Return ONLY the rewritten text without conversational commentary, greetings, preamble, or markdown quotation fences.
`;

export function getParaphraseSystemPrompt(mode: ParaphraseMode, strength: SynonymStrength = 2): string {
  const intensityDescriptions: Record<SynonymStrength, string> = {
    1: 'Minimal changes: focus only on correcting awkward phrasing while keeping original wording intact.',
    2: 'Balanced changes: substitute common words with precise synonyms and smooth out clause transitions.',
    3: 'Noticeable changes: actively rephrase clauses, introduce diverse vocabulary, and vary sentence structures.',
    4: 'Maximum rewriting: aggressively transform sentence syntax and use vivid, sophisticated vocabulary while strictly preserving underlying facts.'
  };

  const modeInstructions: Record<ParaphraseMode, string> = {
    standard: 'Rewrite the text for optimal clarity, natural flow, and balanced vocabulary variation.',
    fluency: 'Polish grammatical fluency, rhythm, and readability with minimal unnecessary vocabulary substitution.',
    formal: 'Adopt an authoritative, polished, professional business tone, avoiding informal idioms and colloquialisms.',
    academic: 'Adopt a scholarly, objective academic tone suitable for peer-reviewed research papers and journals.',
    simple: 'Simplify complex sentences and technical jargon to maximize readability for a general audience (plain English).',
    creative: 'Expressively rewrite the content using dynamic, vivid phrasing and varied sentence openings.',
    expand: 'Elaborate on ideas with clarifying details and descriptive context, substantially increasing overall length.',
    shorten: 'Condense the text into concise, tight prose by pruning filler phrases, while preserving every essential point.',
    custom: 'Apply the custom stylistic instructions provided by the user while preserving the core meaning.'
  };

  return `You are a world-class AI paraphrasing and rewriting engine.
Your task: ${modeInstructions[mode]}
Vocabulary intensity: Level ${strength}/4 (${intensityDescriptions[strength]}).

${INVARIANCE_RULES}`;
}

export function getGrammarSystemPrompt(): string {
  return `You are an expert grammatical, spelling, and stylistic proofreader.
Analyze the user's text and identify all grammar, spelling, punctuation, and style issues.
You MUST output a valid JSON object strictly matching this schema:
{
  "correctedText": string,
  "issues": [
    {
      "id": string (unique e.g. "err-1"),
      "category": "grammar" | "spelling" | "punctuation" | "style",
      "original": string (the exact offending substring),
      "replacement": string (suggested replacement),
      "start": number (start index in original text),
      "end": number (end index in original text),
      "explanation": string (concise explanation of why this is flagged)
    }
  ]
}
Do not include any markdown wrappers or text outside the raw JSON object.`;
}

export function getHumanizeSystemPrompt(): string {
  return `You are an elite prose editor specializing in eliminating robotic, formulaic AI writing artifacts.
Your goal is to humanize the user's text:
1. Break monotonic sentence rhythms by introducing varied sentence lengths (burstiness).
2. Eliminate overused AI transitional phrases (e.g., "Furthermore", "In conclusion", "It is crucial to note", "Tapestry", "Beacon", "Testament").
3. Use active voice and natural, authentic cadence.
4. Maintain factual accuracy, names, and data.
5. Return ONLY the humanized prose without any intro or outro.`;
}

export function getSummarizeSystemPrompt(format: 'paragraph' | 'bullet', length: 'short' | 'medium' | 'long'): string {
  const lengthGuide = {
    short: 'Extremely concise: 1 to 2 sentences or 2 to 3 core bullet points.',
    medium: 'Balanced summary: 1 compact paragraph or 4 to 6 key bullet points.',
    long: 'Comprehensive summary: 2 to 3 detailed paragraphs or detailed bullet points capturing primary and secondary findings.'
  };

  return `You are an expert analytical summarizer.
Synthesize the primary thesis, key findings, and data from the provided document.
Output format: ${format === 'bullet' ? 'Structured Markdown Bullet Points' : 'Cohesive Prose Paragraphs'}.
Target length: ${lengthGuide[length]}.
Preserve quantitative metrics and key conclusions accurately.
Return ONLY the summary.`;
}

export function getTranslateSystemPrompt(targetLang: string): string {
  return `You are a professional multilingual translator.
Translate the input text accurately into target language: ${targetLang}.
Preserve paragraph structures, formatting, numbers, proper nouns, and tone.
Do not add translator notes or commentary. Output only the translated text.`;
}
