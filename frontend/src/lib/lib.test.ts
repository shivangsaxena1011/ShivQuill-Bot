import { describe, it, expect } from 'vitest';
import { applyAllEdits, applyEdit, highlightRanges, italicParts, locateEdit, stripItalics, wordCount } from './text';
import { analyzeReadability, countSyllables, splitSentences } from './readability';
import { sortBibliography, toBibTeX, toBibTeXList, toRIS } from './citationExport';
import { parts, plainText } from './files';

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

  it('gives repeated BibTeX keys a, b, … suffixes within one export', () => {
    const other = { ...resolved, title: 'A different paper', authors: [{ given: 'Ada', family: 'Lovelace' }] };
    const keys = toBibTeXList([resolved, other, resolved, resolved]).match(/^@\w+\{[^,]+/gm)!.map(k => k.split('{')[1]);
    expect(keys).toEqual(['he2016deepa', 'lovelace2016different', 'he2016deepb', 'he2016deepc']);
    expect(toBibTeXList([resolved])).toBe(toBibTeX(resolved));
  });

  it('sorts references alphabetically ignoring italics', () => {
    const items = ['*Zeta* book', 'Alpha, A.', 'beta, B.'].map((entry, i) => ({ id: String(i), style: 'APA', entry, inText: '', resolved, addedAt: i }));
    expect(sortBibliography(items).map(i => i.entry)).toEqual(['Alpha, A.', 'beta, B.', '*Zeta* book']);
  });
});

describe('export italics', () => {
  it('keeps ordinary asterisks unless italics are requested', () => {
    expect(plainText('2 * 3 * 4 and *note*')).toBe('2 * 3 * 4 and *note*');
    expect(parts('a *b* c')).toEqual([{ text: 'a *b* c', italic: false }]);
    expect(plainText('*Nature*, 12', true)).toBe('Nature, 12');
    expect(parts('In *Nature*.', true)).toEqual([{ text: 'In ', italic: false }, { text: 'Nature', italic: true }, { text: '.', italic: false }]);
  });
});

describe('audit round 3 fixes', () => {
  it('does not split sentences at decimals, abbreviations or initials', () => {
    const s = splitSentences('Revenue grew 3.5% in the U.S. last year, e.g. in Texas. Dr. Smith agreed.');
    expect(s.map(x => x.text)).toEqual([
      'Revenue grew 3.5% in the U.S. last year, e.g. in Texas.',
      'Dr. Smith agreed.'
    ]);
    expect(s[1].start).toBe('Revenue grew 3.5% in the U.S. last year, e.g. in Texas. '.length);
  });

  it('still splits ordinary sentences and lines', () => {
    expect(splitSentences('One here. Two here! Three?\nFour').map(x => x.text)).toEqual(['One here.', 'Two here!', 'Three?', 'Four']);
  });

  it('highlights the non-overlapping tail of overlapping ranges', () => {
    const text = 'a'.repeat(120);
    const parts = highlightRanges(text, [{ start: 0, end: 50 }, { start: 10, end: 120 }]);
    const marked = parts.filter(p => p.mark).reduce((n, p) => n + p.text.length, 0);
    expect(marked).toBe(120);
    expect(parts.map(p => p.text).join('')).toBe(text);
  });
});

describe('analysisWordCount (matches the server tokenizer)', () => {
  it('counts letter/digit runs, not whitespace chunks', async () => {
    const { analysisWordCount } = await import('./text');
    expect(analysisWordCount('- • & 🎉 hello, world 2024')).toBe(3);
    expect(analysisWordCount("it's fine")).toBe(2);
  });

  it('splits Chinese text into words instead of one giant chunk', async () => {
    const { analysisWordCount, wordCount } = await import('./text');
    const zh = '长城是中国古代的军事防御工程，是一道高大、坚固而且连绵不断的长垣。';
    expect(wordCount(zh)).toBe(1);
    expect(analysisWordCount(zh)).toBeGreaterThan(10);
  });
});

describe('grammar fixes after edits (round 3)', () => {
  it('fallback search matches whole words only', async () => {
    const { locateEdit } = await import('./text');
    // stored offset 6 no longer matches after "Today " was typed at the start
    const edit = { id: '1', start: 6, end: 7, original: 'a', replacement: 'an' };
    const text = 'Today I saw a apple';
    expect(locateEdit(text, edit)).toBe(12);
  });

  it('rebases offsets after the user edits, and drops edited-over items', async () => {
    const { rebaseEdits } = await import('./text');
    const before = 'I saw a apple and teh car';
    const items = [
      { id: 'a', start: 6, end: 7, original: 'a', replacement: 'an' },
      { id: 'teh', start: 18, end: 21, original: 'teh', replacement: 'the' }
    ];
    const typedAtStart = rebaseEdits(before, 'Today ' + before, items);
    expect(typedAtStart.map(i => i.start)).toEqual([12, 24]);
    const editedOver = rebaseEdits(before, 'I saw a apple and the car', items);
    expect(editedOver.map(i => i.id)).toEqual(['a']);
  });
});

describe('text file import encodings', () => {
  it('decodes UTF-16 (Notepad "Unicode") and Windows-1252 (ANSI) files', async () => {
    const { decodeText } = await import('./files');
    const utf16 = new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0xe9, 0x00]); // BOM + "Hé"
    expect(decodeText(utf16)).toBe('Hé');
    const ansi = new Uint8Array([0x43, 0x61, 0x66, 0xe9]); // "Café" in Windows-1252
    expect(decodeText(ansi)).toBe('Café');
    expect(decodeText(new TextEncoder().encode('naïve ✓'))).toBe('naïve ✓');
  });
});
