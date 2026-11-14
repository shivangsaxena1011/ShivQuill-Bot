import { describe, it, expect } from 'vitest';
import { applyAllEdits, applyEdit, highlightRanges, italicParts, locateEdit, stripItalics, wordCount } from './text';
import { analyzeReadability, countSyllables, splitSentences } from './readability';
import { sortBibliography, toBibTeX, toRIS } from './citationExport';

describe('text helpers', () => {
  it('counts words without splitting into arrays', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount('  one two\nthree\t four  ')).toBe(4);
  });

  it('applies an edit at its offset and shifts later edits', () => {
    const text = 'teh cat and teh dog';
    const edits = [
      { id: 'a', start: 0, end: 3, original: 'teh', replacement: 'the' },
      { id: 'b', start: 12, end: 15, original: 'teh', replacement: 'that' }
    ];
    const r = applyEdit(text, edits[1], edits);
    expect(r.text).toBe('teh cat and that dog');
    expect(r.remaining).toHaveLength(1);
    expect(r.remaining[0].start).toBe(0);
  });

  it('finds the nearest occurrence when offsets are stale', () => {
    expect(locateEdit('x teh y teh', { id: 'a', start: 9, end: 12, original: 'teh', replacement: 'the' })).toBe(8);
    expect(locateEdit('nothing here', { id: 'a', start: 0, end: 3, original: 'teh', replacement: 'the' })).toBe(-1);
  });

  it('applies all non-overlapping edits', () => {
    const r = applyAllEdits('aaa bbb ccc', [
      { id: '1', start: 0, end: 3, original: 'aaa', replacement: 'A' },
      { id: '2', start: 8, end: 11, original: 'ccc', replacement: 'C' },
      { id: '3', start: 1, end: 5, original: 'aa b', replacement: 'X' } // overlaps #1
    ]);
    expect(r.text).toBe('A bbb C');
    expect(r.appliedIds.has('3')).toBe(false);
  });

  it('handles italics markup and highlight ranges', () => {
    expect(italicParts('A *B* C')).toEqual([{ text: 'A ', italic: false }, { text: 'B', italic: true }, { text: ' C', italic: false }]);
    expect(stripItalics('*Title*, 2020')).toBe('Title, 2020');
    const parts = highlightRanges('hello world', [{ start: 6, end: 11 }]);
    expect(parts.map(p => p.text).join('')).toBe('hello world');
    expect(parts[1]).toMatchObject({ text: 'world', mark: true });
  });
});

describe('readability', () => {
  it('counts syllables reasonably', () => {
    expect(countSyllables('cat')).toBe(1);
    expect(countSyllables('readability')).toBeGreaterThanOrEqual(4);
  });

  it('splits sentences with offsets', () => {
    const text = 'First one. Second one!\nThird';
    const s = splitSentences(text);
    expect(s.map(x => x.text)).toEqual(['First one.', 'Second one!', 'Third']);
    expect(text.slice(s[1].start, s[1].start + s[1].text.length)).toBe('Second one!');
  });

  it('detects passive voice, long sentences and repetition', () => {
    const long = 'This is a very long sentence that keeps going on and on with many words in it so that it clearly exceeds the twenty five word limit we use.';
    const r = analyzeReadability(`The report was written by the team. ${long} The results matter. The results are clear.`);
    expect(r.passiveCount).toBeGreaterThanOrEqual(1);
    expect(r.longSentences.length).toBe(1);
    expect(r.repetitions.some(x => x.word === 'results')).toBe(true);
    expect(r.topWords.length).toBeGreaterThan(0);
    expect(r.readingMinutes).toBeGreaterThan(0);
  });

  it('returns zeros for empty text', () => {
    const r = analyzeReadability('');
    expect(r.words).toBe(0);
    expect(r.fleschReadingEase).toBe(0);
  });
});

describe('citation export', () => {
  const resolved = {
    sourceType: 'journal' as const,
    title: 'Deep residual learning for image recognition',
    authors: [{ given: 'Kaiming', family: 'He' }, { given: 'Xiangyu', family: 'Zhang' }],
    year: '2016',
    containerTitle: 'CVPR',
    volume: '1',
    issue: '2',
    pages: '770–778',
    doi: '10.1109/CVPR.2016.90'
  };

  it('builds BibTeX', () => {
    const bib = toBibTeX(resolved);
    expect(bib.startsWith('@article{he2016deep,')).toBe(true);
    expect(bib).toContain('author = {He, Kaiming and Zhang, Xiangyu}');
    expect(bib).toContain('pages = {770--778}');
    expect(bib).toContain('doi = {10.1109/CVPR.2016.90}');
  });

  it('builds RIS', () => {
    const ris = toRIS(resolved);
    expect(ris.split('\n')[0]).toBe('TY  - JOUR');
    expect(ris).toContain('AU  - He, Kaiming');
    expect(ris).toContain('SP  - 770');
    expect(ris).toContain('EP  - 778');
    expect(ris.trim().endsWith('ER  -')).toBe(true);
  });

  it('sorts references alphabetically ignoring italics', () => {
    const items = ['*Zeta* book', 'Alpha, A.', 'beta, B.'].map((entry, i) => ({ id: String(i), style: 'APA', entry, inText: '', resolved, addedAt: i }));
    expect(sortBibliography(items).map(i => i.entry)).toEqual(['Alpha, A.', 'beta, B.', '*Zeta* book']);
  });
});
