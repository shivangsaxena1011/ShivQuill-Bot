import * as Diff from 'diff';
import { DiffSpan } from './types.js';

/**
 * Word-level difference engine with semantic categorization
 */
export function generateDiffSpans(originalText: string, alteredText: string): DiffSpan[] {
  const rawDiff = Diff.diffWords(originalText, alteredText, { ignoreCase: false });
  const spans: DiffSpan[] = [];

  for (let i = 0; i < rawDiff.length; i++) {
    const current = rawDiff[i];

    if (!current.added && !current.removed) {
      spans.push({
        value: current.value,
        type: 'unchanged'
      });
      continue;
    }

    // Check if next token is an addition paired with this removal (replacement/synonym)
    if (current.removed && i + 1 < rawDiff.length && rawDiff[i + 1].added) {
      const removedText = current.value;
      const addedText = rawDiff[i + 1].value;

      spans.push({
        value: addedText,
        type: 'synonym',
        original: removedText,
        alternatives: generateFallbackSynonyms(addedText)
      });
      i++; // Skip the paired addition
      continue;
    }

    if (current.added) {
      spans.push({
        value: current.value,
        type: 'added'
      });
    } else if (current.removed) {
      spans.push({
        value: current.value,
        type: 'removed'
      });
    }
  }

  return spans;
}

/**
 * Helper to provide contextual synonym suggestions for the interactive popover
 */
function generateFallbackSynonyms(word: string): string[] {
  const clean = word.trim().toLowerCase();
  const commonMap: Record<string, string[]> = {
    'important': ['crucial', 'essential', 'significant', 'vital', 'key'],
    'help': ['assist', 'aid', 'support', 'facilitate', 'enable'],
    'show': ['demonstrate', 'illustrate', 'exhibit', 'reveal', 'indicate'],
    'use': ['utilize', 'employ', 'apply', 'leverage', 'adopt'],
    'make': ['create', 'produce', 'generate', 'construct', 'develop'],
    'change': ['alter', 'modify', 'transform', 'adjust', 'convert'],
    'good': ['exceptional', 'favorable', 'beneficial', 'advantageous', 'superb'],
    'bad': ['adverse', 'detrimental', 'unfavorable', 'poor', 'substandard'],
    'big': ['substantial', 'considerable', 'extensive', 'vast', 'prominent'],
    'small': ['minor', 'modest', 'compact', 'diminutive', 'slight'],
    'fast': ['rapid', 'swift', 'expeditious', 'accelerated', 'prompt'],
    'slow': ['gradual', 'measured', 'delayed', 'deliberate', 'leisurely']
  };

  return commonMap[clean] || [word];
}
