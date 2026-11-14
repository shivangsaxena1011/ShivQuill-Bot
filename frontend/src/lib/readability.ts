/**
 * Client-side readability analysis (no server calls): grade level, reading ease, reading time,
 * passive voice, adverbs, long sentences, word frequency and close repetitions.
 */

export interface SentenceInfo {
  text: string;
  start: number;
  words: number;
  passive: boolean;
}

export interface WordFreq {
  word: string;
  count: number;
}

export interface ReadabilityReport {
  words: number;
  characters: number;
  sentences: number;
  paragraphs: number;
  syllables: number;
  avgSentenceLength: number;
  avgWordLength: number;
  fleschReadingEase: number;
  gradeLevel: number;
  readingMinutes: number;
  speakingMinutes: number;
  passiveCount: number;
  passivePercent: number;
  adverbCount: number;
  longSentences: SentenceInfo[];
  veryLongSentences: number;
  sentenceList: SentenceInfo[];
  topWords: WordFreq[];
  uniqueWords: number;
  /** Character ranges of words repeated within a short distance */
  repetitions: { start: number; end: number; word: string }[];
  truncated: boolean;
}

export const STOPWORDS = new Set(
  ('a an the and or but if then else so of to in on at by for with from as is are was were be been being am ' +
    'it its this that these those there here i me my we our you your he him his she her they them their ' +
    'not no yes do does did done have has had will would can could should may might must shall into out up ' +
    'down over under about than too very just also only more most some any each such both all what which who ' +
    'whom whose when where why how one two s t')
    .split(' ')
);

const IRREGULAR_PARTICIPLES = new Set(
  ('known shown given taken written made done seen found built sent held kept left lost paid said sold told ' +
    'thought brought bought caught taught meant read led fed set put cut hit hurt shut spread run begun chosen ' +
    'driven eaten fallen forgotten forgiven frozen gotten hidden ridden risen shaken spoken stolen sworn torn ' +
    'woken worn broken understood withdrawn drawn grown thrown flown blown born borne beaten bitten')
    .split(' ')
);

const BE_FORMS = /^(is|are|was|were|be|been|being|am|isn't|aren't|wasn't|weren't)$/i;

export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

function isPassive(sentence: string): boolean {
  const tokens = sentence.toLowerCase().match(/[a-z']+/g) || [];
  for (let i = 0; i < tokens.length - 1; i++) {
    if (!BE_FORMS.test(tokens[i])) continue;
    // allow one adverb between ("was quickly approved")
    for (const j of [i + 1, i + 2]) {
      const t = tokens[j];
      if (!t) break;
      if ((t.endsWith('ed') && t.length > 3) || IRREGULAR_PARTICIPLES.has(t)) return true;
      if (!t.endsWith('ly')) break;
    }
  }
  return false;
}

/** Splits text into sentences with their start offsets. */
export function splitSentences(text: string): SentenceInfo[] {
  const result: SentenceInfo[] = [];
  const re = /[^.!?\n]+(?:[.!?]+["')\]]*|\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    const raw = m[0];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const words = (trimmed.match(/[\p{L}\p{N}'’-]+/gu) || []).length;
    if (words === 0) continue;
    result.push({ text: trimmed, start: m.index + raw.indexOf(trimmed), words, passive: isPassive(trimmed) });
  }
  return result;
}

const MAX_ANALYZED = 300_000; // analyze up to ~50k words; beyond that the UI notes truncation

export function analyzeReadability(input: string): ReadabilityReport {
  const truncated = input.length > MAX_ANALYZED;
  const text = truncated ? input.slice(0, MAX_ANALYZED) : input;

  const wordMatches = Array.from(text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu));
  const words = wordMatches.length;
  const sentenceList = splitSentences(text);
  const sentences = Math.max(1, sentenceList.length);
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim()).length;

  let syllables = 0;
  let letters = 0;
  let adverbCount = 0;
  const freq = new Map<string, number>();
  const lastSeen = new Map<string, number>();
  const repetitions: ReadabilityReport['repetitions'] = [];

  wordMatches.forEach((m, idx) => {
    const w = m[0];
    const lower = w.toLowerCase();
    syllables += countSyllables(w);
    letters += w.length;
    if (lower.length > 4 && lower.endsWith('ly') && !/(only|family|early|reply|apply|supply|likely|daily|july|italy|holy|ugly)$/.test(lower)) adverbCount++;
    if (!STOPWORDS.has(lower) && lower.length > 2 && !/^\d+$/.test(lower)) {
      freq.set(lower, (freq.get(lower) || 0) + 1);
      const prev = lastSeen.get(lower);
      // Same meaningful word again within 12 words reads as repetitive
      if (prev !== undefined && idx - prev <= 12 && repetitions.length < 500) {
        repetitions.push({ start: m.index!, end: m.index! + w.length, word: lower });
      }
      lastSeen.set(lower, idx);
    }
  });

  const wordsSafe = Math.max(1, words);
  const avgSentenceLength = words / sentences;
  const avgSyllables = syllables / wordsSafe;
  const fleschReadingEase = Math.round(Math.min(100, Math.max(0, 206.835 - 1.015 * avgSentenceLength - 84.6 * avgSyllables)));
  const gradeLevel = Math.max(0, Math.round((0.39 * avgSentenceLength + 11.8 * avgSyllables - 15.59) * 10) / 10);
  const passiveCount = sentenceList.filter(s => s.passive).length;

  return {
    words,
    characters: text.length,
    sentences: sentenceList.length,
    paragraphs,
    syllables,
    avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
    avgWordLength: Math.round((letters / wordsSafe) * 10) / 10,
    fleschReadingEase: words ? fleschReadingEase : 0,
    gradeLevel: words ? gradeLevel : 0,
    readingMinutes: Math.round((words / 238) * 10) / 10,
    speakingMinutes: Math.round((words / 150) * 10) / 10,
    passiveCount,
    passivePercent: sentenceList.length ? Math.round((passiveCount / sentenceList.length) * 100) : 0,
    adverbCount,
    longSentences: sentenceList.filter(s => s.words > 25).slice(0, 100),
    veryLongSentences: sentenceList.filter(s => s.words > 40).length,
    sentenceList,
    topWords: Array.from(freq.entries())
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
      .slice(0, 25),
    uniqueWords: freq.size,
    repetitions,
    truncated
  };
}

export function easeLabel(score: number): string {
  if (score >= 80) return 'Very easy';
  if (score >= 65) return 'Easy';
  if (score >= 50) return 'Fairly difficult';
  if (score >= 30) return 'Difficult';
  return 'Very difficult';
}
