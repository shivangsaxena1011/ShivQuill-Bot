/**
 * Lightweight, dependency-free language identification.
 * 1. Non-Latin scripts are identified by Unicode block (kana is checked before CJK ideographs,
 *    and Urdu/Persian letters before generic Arabic script).
 * 2. Latin-script languages are scored by frequency of common function words, so English text
 *    containing words like "in" or "a" is no longer misdetected as German or Italian.
 */

const LATIN_STOPWORDS: Record<string, string[]> = {
  en: ['the', 'and', 'is', 'are', 'was', 'were', 'of', 'to', 'in', 'that', 'it', 'with', 'for', 'this', 'on', 'be', 'have', 'has', 'not', 'you', 'they', 'from', 'by', 'which', 'or', 'an', 'will', 'would', 'their', 'what'],
  es: ['el', 'la', 'los', 'las', 'que', 'de', 'y', 'en', 'un', 'una', 'es', 'por', 'para', 'con', 'no', 'se', 'del', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'su', 'está', 'muy', 'también', 'fue', 'hay', 'este'],
  fr: ['le', 'la', 'les', 'de', 'des', 'et', 'est', 'un', 'une', 'du', 'que', 'qui', 'dans', 'pour', 'pas', 'sur', 'avec', 'ce', 'il', 'elle', 'nous', 'vous', 'sont', 'au', 'aux', 'mais', 'ou', 'plus', 'cette', 'être'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'zu', 'den', 'von', 'mit', 'sich', 'des', 'auf', 'für', 'im', 'dem', 'auch', 'es', 'sind', 'wir', 'ich', 'sie', 'werden', 'wird', 'oder', 'aber', 'nach', 'bei'],
  it: ['il', 'lo', 'gli', 'della', 'che', 'di', 'e', 'è', 'un', 'una', 'per', 'non', 'sono', 'con', 'del', 'nel', 'alla', 'anche', 'questo', 'come', 'più', 'ma', 'delle', 'dei', 'si', 'ha', 'le', 'da', 'tra', 'molto'],
  pt: ['o', 'os', 'as', 'que', 'de', 'e', 'é', 'um', 'uma', 'do', 'da', 'dos', 'das', 'em', 'para', 'com', 'não', 'por', 'mais', 'se', 'no', 'na', 'ao', 'como', 'mas', 'foi', 'são', 'está', 'também', 'muito'],
  nl: ['de', 'het', 'een', 'en', 'van', 'is', 'dat', 'op', 'te', 'zijn', 'voor', 'met', 'niet', 'aan', 'er', 'ook', 'als', 'maar', 'om', 'bij', 'wordt', 'nog', 'deze', 'wij', 'ik', 'je', 'naar', 'heeft', 'dit', 'worden'],
  tr: ['ve', 'bir', 'bu', 'da', 'de', 'için', 'ile', 'çok', 'ne', 'daha', 'gibi', 'olarak', 'ama', 'en', 'var', 'mi', 'değil', 'olan', 'kadar', 'sonra'],
  pl: ['i', 'w', 'nie', 'na', 'się', 'jest', 'że', 'z', 'do', 'to', 'jak', 'ale', 'od', 'po', 'za', 'tak', 'czy', 'przez', 'są', 'dla'],
  sv: ['och', 'att', 'det', 'som', 'en', 'är', 'av', 'för', 'på', 'med', 'inte', 'den', 'till', 'har', 'om', 'ett', 'de', 'men', 'var', 'jag'],
  id: ['yang', 'dan', 'di', 'ini', 'itu', 'dengan', 'untuk', 'tidak', 'dari', 'dalam', 'akan', 'pada', 'juga', 'ke', 'karena', 'ada', 'adalah', 'saya', 'mereka', 'atau'],
  vi: ['và', 'của', 'là', 'có', 'không', 'được', 'trong', 'những', 'cho', 'với', 'một', 'các', 'này', 'người', 'đã', 'để', 'khi', 'như', 'từ', 'cũng']
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese',
  nl: 'Dutch', tr: 'Turkish', pl: 'Polish', sv: 'Swedish', id: 'Indonesian', vi: 'Vietnamese',
  ar: 'Arabic', ur: 'Urdu', fa: 'Persian', he: 'Hebrew', hi: 'Hindi', mr: 'Marathi', bn: 'Bengali',
  pa: 'Punjabi', gu: 'Gujarati', ta: 'Tamil', te: 'Telugu', th: 'Thai', el: 'Greek', ru: 'Russian',
  uk: 'Ukrainian', ja: 'Japanese', zh: 'Chinese', ko: 'Korean'
};

const STOPWORD_SETS: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(LATIN_STOPWORDS).map(([code, words]) => [code, new Set(words)])
);

function label(code: string): string {
  return `${LANGUAGE_NAMES[code] || code} (${code})`;
}

/** Returns the most likely ISO 639-1 code for the text. */
export function detectLanguageCode(input: string): string {
  // Only a prefix is needed for identification; keeps this O(1) on huge documents
  const text = input.slice(0, 5000);

  // Decide by the share of letters in each script, not by the first non-Latin character:
  // "β-blockers" in English text must not make it Greek, and a "・" must not make Chinese Japanese.
  const letters = (text.match(/\p{L}/gu) || []).length || 1;
  const count = (re: RegExp) => (text.match(re) || []).length;
  const share = (n: number) => n / letters;
  const kana = count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu);
  const han = count(/\p{Script=Han}/gu);
  // Japanese mixes kana into kanji text; a few kana in Chinese text (names, loanwords) don't count
  if (share(kana + han) >= 0.3 && kana >= 3 && kana >= (kana + han) * 0.1) return 'ja';
  if (share(count(/\p{Script=Hangul}/gu)) >= 0.3) return 'ko';
  if (share(han) >= 0.3) return 'zh';
  if (share(count(/\p{Script=Arabic}/gu)) >= 0.3) {
    if (/[ٹڈڑںھہے]/.test(text)) return 'ur'; // ٹ ڈ ڑ ں ھ ہ ے
    if (/[پچژگیک]/.test(text)) return 'fa'; // پ چ ژ گ ی ک
    return 'ar';
  }
  if (share(count(/\p{Script=Hebrew}/gu)) >= 0.3) return 'he';
  if (share(count(/\p{Script=Devanagari}/gu)) >= 0.3) return /(आहे|आहेत|ळ)/.test(text) ? 'mr' : 'hi';
  if (share(count(/\p{Script=Bengali}/gu)) >= 0.3) return 'bn';
  if (share(count(/\p{Script=Gurmukhi}/gu)) >= 0.3) return 'pa';
  if (share(count(/\p{Script=Gujarati}/gu)) >= 0.3) return 'gu';
  if (share(count(/\p{Script=Tamil}/gu)) >= 0.3) return 'ta';
  if (share(count(/\p{Script=Telugu}/gu)) >= 0.3) return 'te';
  if (share(count(/\p{Script=Thai}/gu)) >= 0.3) return 'th';
  if (share(count(/\p{Script=Greek}/gu)) >= 0.3) return 'el';
  if (share(count(/\p{Script=Cyrillic}/gu)) >= 0.3) return /[іїєґ]/i.test(text) ? 'uk' : 'ru';

  const words = text.toLowerCase().match(/[\p{L}]+/gu) || [];
  if (words.length === 0) return 'en';

  let best = 'en';
  let bestScore = 0;
  for (const [code, set] of Object.entries(STOPWORD_SETS)) {
    let hits = 0;
    for (const w of words) if (set.has(w)) hits++;
    const score = hits / words.length;
    if (score > bestScore) {
      bestScore = score;
      best = code;
    }
  }
  return best;
}

/** Human-readable label such as "English (en)". */
export function detectLanguage(text: string): string {
  return label(detectLanguageCode(text));
}
