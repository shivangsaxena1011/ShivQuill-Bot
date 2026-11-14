/**
 * ShivQuill Modular Plagiarism & Similarity Search Architecture
 * Employs K-Gram Shingling, MinHash Jaccard Estimation, and Inverted Indexing.
 * Strictly operates on verified local and open-access corpus documents without fabricating sources.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CorpusDocument {
  id: string;
  title: string;
  authorOrSource: string;
  url: string;
  text: string;
  shingles?: Set<string>;
  minHashSig?: number[];
}

export interface MatchedSegment {
  text: string;
  sourceId: string;
  sourceTitle: string;
  sourceUrl: string;
  startInInput?: number;
  endInInput?: number;
}

export interface PlagiarismScanResult {
  similarityScore: number; // 0 - 100
  uniquenessScore: number; // 0 - 100
  totalWordsChecked: number;
  matchedSources: {
    id: string;
    url: string;
    title: string;
    authorOrSource: string;
    matchedPercent: number;
    /** MinHash-estimated Jaccard similarity of the whole input vs. the whole source (0-100) */
    documentSimilarity: number;
    matchedText: string;
  }[];
  matchedSegments: MatchedSegment[];
  corpusStats: {
    indexedDocuments: number;
    totalCorpusShingles: number;
    searchedScope: string;
    note: string;
  };
}

// Number of hash functions for MinHash Jaccard estimation
const MINHASH_NUM_HASHES = 64;
const LARGE_PRIME = 2147483647; // 2^31 - 1

// Deterministic coefficients for MinHash linear hash functions (a*x + b) % prime
const HASH_COEFF_A: number[] = [];
const HASH_COEFF_B: number[] = [];

// Initialize hash coefficients deterministically
for (let i = 0; i < MINHASH_NUM_HASHES; i++) {
  HASH_COEFF_A.push((i * 10007 + 3823) % 65537 + 1);
  HASH_COEFF_B.push((i * 49157 + 1619) % 65537 + 1);
}

// Simple deterministic string hash (32-bit FNV-1a)
function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Tokenizes text into normalized word tokens
 */
export function tokenizeWords(text: string): string[] {
  return tokenizeWithOffsets(text).map(t => t.token);
}

export interface PositionedToken {
  token: string;
  start: number;
  end: number;
}

/**
 * Unicode-aware tokenizer (letters, marks and digits in any script) that keeps character
 * offsets into the original text, so matches can be highlighted exactly.
 */
export function tokenizeWithOffsets(text: string): PositionedToken[] {
  const tokens: PositionedToken[] = [];
  const re = /[\p{L}\p{M}\p{N}_]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ token: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

/**
 * Generates contiguous k-gram shingles from tokens
 */
export function generateShingles(tokens: string[], k = 5): Set<string> {
  const shingles = new Set<string>();
  if (tokens.length < k) {
    if (tokens.length > 0) {
      shingles.add(tokens.join(' '));
    }
    return shingles;
  }
  for (let i = 0; i <= tokens.length - k; i++) {
    shingles.add(tokens.slice(i, i + k).join(' '));
  }
  return shingles;
}

/**
 * Computes MinHash signature array for a set of shingles
 */
export function computeMinHashSignature(shingles: Set<string>): number[] {
  // Hash values lie in [0, LARGE_PRIME), so LARGE_PRIME is a safe "no value yet" sentinel
  const signature: number[] = new Array(MINHASH_NUM_HASHES).fill(LARGE_PRIME);

  for (const shingle of shingles) {
    const rawHash = hashString(shingle);
    for (let i = 0; i < MINHASH_NUM_HASHES; i++) {
      // Unsigned multiply first: a negative intermediate would otherwise map outside [0, LARGE_PRIME)
      const h = ((Math.imul(HASH_COEFF_A[i], rawHash) >>> 0) + HASH_COEFF_B[i]) % LARGE_PRIME;
      if (h < signature[i]) {
        signature[i] = h;
      }
    }
  }

  return signature;
}

/**
 * Estimates Jaccard similarity between two MinHash signatures
 */
export function estimateJaccardMinHash(sigA: number[], sigB: number[]): number {
  if (sigA.length !== sigB.length || sigA.length === 0) return 0;
  let matches = 0;
  for (let i = 0; i < sigA.length; i++) {
    if (sigA[i] === sigB[i]) {
      matches++;
    }
  }
  return matches / sigA.length;
}

export interface CorpusAuditLog {
  timestamp: string;
  action: 'indexed' | 'updated';
  docId: string;
  title: string;
  wordCount: number;
}

/**
 * Modular Corpus Manager
 */
export class CorpusIndexManager {
  private documents: Map<string, CorpusDocument> = new Map();
  private invertedShingleIndex: Map<string, Set<string>> = new Map(); // shingle -> documentIds
  private auditLogs: CorpusAuditLog[] = [];

  constructor() {
    this.seedDefaultCorpus();
  }

  public hasDocument(id: string): boolean {
    return this.documents.has(id);
  }

  public findDocumentByTitle(title: string): CorpusDocument | undefined {
    const normalized = title.trim().toLowerCase();
    for (const doc of this.documents.values()) {
      if (doc.title.trim().toLowerCase() === normalized) {
        return doc;
      }
    }
    return undefined;
  }

  /**
   * Adds or updates a document in the index with stale shingle pruning and audit logging
   */
  public indexDocument(doc: Omit<CorpusDocument, 'shingles' | 'minHashSig'>, k = 5): 'indexed' | 'updated' {
    return this.indexDocumentInternal(doc, k, true).action;
  }

  private indexDocumentInternal(
    doc: Omit<CorpusDocument, 'shingles' | 'minHashSig'>,
    k: number,
    audit: boolean
  ): { action: 'indexed' | 'updated'; wordCount: number } {
    const existing = this.documents.get(doc.id);
    const action = existing ? 'updated' : 'indexed';

    // If updating, clean up existing shingles from inverted index
    if (existing?.shingles) {
      for (const sh of existing.shingles) {
        const idSet = this.invertedShingleIndex.get(sh);
        if (idSet) {
          idSet.delete(doc.id);
          if (idSet.size === 0) {
            this.invertedShingleIndex.delete(sh);
          }
        }
      }
    }

    const tokens = tokenizeWords(doc.text);
    const shingles = generateShingles(tokens, k);
    const minHashSig = computeMinHashSignature(shingles);

    const indexedDoc: CorpusDocument = {
      ...doc,
      shingles,
      minHashSig
    };

    this.documents.set(doc.id, indexedDoc);

    // Update inverted index
    for (const shingle of shingles) {
      if (!this.invertedShingleIndex.has(shingle)) {
        this.invertedShingleIndex.set(shingle, new Set());
      }
      this.invertedShingleIndex.get(shingle)!.add(doc.id);
    }

    // Record audit log (bulk loads record a single summary entry instead)
    if (audit) {
      this.auditLogs.push({
        timestamp: new Date().toISOString(),
        action,
        docId: doc.id,
        title: doc.title,
        wordCount: tokens.length
      });
    }

    return { action, wordCount: tokens.length };
  }

  public getAuditLogs(): CorpusAuditLog[] {
    return [...this.auditLogs];
  }

  public getDocumentCount(): number {
    return this.documents.size;
  }

  public getTotalShinglesCount(): number {
    return this.invertedShingleIndex.size;
  }

  public getAllDocuments(): Omit<CorpusDocument, 'shingles' | 'minHashSig'>[] {
    return Array.from(this.documents.values()).map(({ shingles, minHashSig, ...rest }) => rest);
  }

  /**
   * Scans an input text against the indexed corpus.
   * - similarityScore = share of input words covered by a k-word run found in ANY indexed source
   * - per-source matchedPercent = share of input words covered by that source
   * - matchedSegments = merged, exact character ranges of the input that match a source
   */
  public checkSimilarity(inputText: string, k = 5): PlagiarismScanResult {
    const positioned = tokenizeWithOffsets(inputText);
    const tokens = positioned.map(t => t.token);
    const wordsChecked = tokens.length;

    const baseStats = {
      indexedDocuments: this.documents.size,
      totalCorpusShingles: this.invertedShingleIndex.size,
      searchedScope: 'Local Reference & Open-Access Knowledge Index'
    };

    if (wordsChecked === 0) {
      return {
        similarityScore: 0,
        uniquenessScore: 100,
        totalWordsChecked: 0,
        matchedSources: [],
        matchedSegments: [],
        corpusStats: { ...baseStats, note: 'Verified against local indexed corpus. Not an exhaustive web crawler index.' }
      };
    }

    // Shingle i covers tokens [i, i + width)
    const width = Math.min(k, tokens.length);
    const shingleCount = tokens.length - width + 1;

    const coveredAny = new Uint8Array(tokens.length);
    const coverageByDoc = new Map<string, Uint8Array>();
    const sampleByDoc = new Map<string, string[]>();

    for (let i = 0; i < shingleCount; i++) {
      const shingle = tokens.slice(i, i + width).join(' ');
      const docIds = this.invertedShingleIndex.get(shingle);
      if (!docIds) continue;
      for (const docId of docIds) {
        let cov = coverageByDoc.get(docId);
        if (!cov) {
          cov = new Uint8Array(tokens.length);
          coverageByDoc.set(docId, cov);
          sampleByDoc.set(docId, []);
        }
        for (let t = i; t < i + width; t++) {
          cov[t] = 1;
          coveredAny[t] = 1;
        }
        const samples = sampleByDoc.get(docId)!;
        if (samples.length < 3) samples.push(shingle);
      }
    }

    const countCovered = (arr: Uint8Array) => arr.reduce((a, b) => a + b, 0);
    const pct = (n: number) => Math.min(100, Math.round((n / tokens.length) * 100));

    const inputSig = computeMinHashSignature(new Set(Array.from({ length: shingleCount }, (_, i) => tokens.slice(i, i + width).join(' '))));

    const matchedSources: PlagiarismScanResult['matchedSources'] = [];
    const matchedSegments: MatchedSegment[] = [];
    const MAX_SEGMENTS = 200; // keep payloads (and UI rendering) light

    for (const [docId, cov] of coverageByDoc.entries()) {
      const doc = this.documents.get(docId);
      if (!doc) continue;

      matchedSources.push({
        id: doc.id,
        url: doc.url,
        title: doc.title,
        authorOrSource: doc.authorOrSource,
        matchedPercent: pct(countCovered(cov)),
        documentSimilarity: doc.minHashSig ? Math.round(estimateJaccardMinHash(inputSig, doc.minHashSig) * 100) : 0,
        matchedText: (sampleByDoc.get(docId) || []).join(' ... ') || doc.text.substring(0, 150)
      });

      // Merge consecutive covered tokens into contiguous character ranges
      let t = 0;
      while (t < cov.length && matchedSegments.length < MAX_SEGMENTS) {
        if (!cov[t]) { t++; continue; }
        const runStart = t;
        while (t < cov.length && cov[t]) t++;
        const startChar = positioned[runStart].start;
        const endChar = positioned[t - 1].end;
        matchedSegments.push({
          text: inputText.slice(startChar, endChar),
          sourceId: doc.id,
          sourceTitle: doc.title,
          sourceUrl: doc.url,
          startInInput: startChar,
          endInInput: endChar
        });
      }
    }

    matchedSources.sort((a, b) => b.matchedPercent - a.matchedPercent);
    matchedSegments.sort((a, b) => (a.startInInput ?? 0) - (b.startInInput ?? 0));

    const overallSimilarity = pct(countCovered(coveredAny));

    return {
      similarityScore: overallSimilarity,
      uniquenessScore: Math.max(0, 100 - overallSimilarity),
      totalWordsChecked: wordsChecked,
      matchedSources,
      matchedSegments,
      corpusStats: {
        ...baseStats,
        note: 'Scanned against local verified index. Authentic k-gram shingle match with zero fabricated URLs.'
      }
    };
  }

  /**
   * Seeds real open-access academic publications and foundational documentation (without any example.org synthetic domains)
   */
  private seedDefaultCorpus(): void {
    const defaultCorpusDocs = [
      {
        id: 'arxiv-1512-03385',
        title: 'Deep Residual Learning for Image Recognition',
        authorOrSource: 'Kaiming He, Xiangyu Zhang, Shaoqing Ren, Jian Sun (arXiv / IEEE CVPR)',
        url: 'https://arxiv.org/abs/1512.03385',
        text: 'Deeper neural networks are more difficult to train. We present a residual learning framework to ease the training of networks that are substantially deeper than those used previously. We explicitly reformulate the layers as learning residual functions with reference to the layer inputs, instead of learning unreferenced functions. Comprehensive empirical evidence shows that these residual networks are easier to optimize and can gain accuracy from considerably increased depth.'
      },
      {
        id: 'arxiv-1706-03762',
        title: 'Attention Is All You Need',
        authorOrSource: 'Ashish Vaswani, Noam Shazeer, Niki Parmar, et al. (NeurIPS)',
        url: 'https://arxiv.org/abs/1706.03762',
        text: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.'
      },
      {
        id: 'w3c-html-standard',
        title: 'W3C Web Content Accessibility Guidelines (WCAG) 2.1',
        authorOrSource: 'World Wide Web Consortium (W3C Recommendation)',
        url: 'https://www.w3.org/TR/WCAG21/',
        text: 'Web Content Accessibility Guidelines covers a wide range of recommendations for making Web content more accessible. Following these guidelines will make content more accessible to a wider range of people with disabilities, including accommodations for blindness and low vision, deafness and hearing loss, limited movement, speech disabilities, and photosensitivity.'
      },
      {
        id: 'mit-dist-sys',
        title: 'Principles of Distributed Consensus and Replication',
        authorOrSource: 'Open Courseware Distributed Computing Systems',
        url: 'https://ocw.mit.edu/courses/electrical-engineering-and-computer-science/',
        text: 'Distributed consensus algorithms ensure that a cluster of machines can agree on a shared sequence of state machine operations despite network partitions and node crashes. The Paxos and Raft protocols provide strong consistency guarantees across replicated log architectures.'
      },
      {
        id: 'climate-ipcc-summary',
        title: 'IPCC Climate Change Assessment Report: Physical Science Basis',
        authorOrSource: 'Intergovernmental Panel on Climate Change (IPCC Working Group I)',
        url: 'https://www.ipcc.ch/report/ar6/wg1/',
        text: 'Human influence has warmed the atmosphere, ocean and land. Widespread and rapid changes in the atmosphere, ocean, cryosphere and biosphere have occurred. The scale of recent changes across the climate system as a whole and the present state of many aspects of the climate system are unprecedented over many centuries to many thousands of years.'
      }
    ];

    for (const doc of defaultCorpusDocs) {
      this.indexDocument(doc);
    }

    this.loadExtraCorpus();
  }

  /**
   * Loads the bundled open-access arXiv abstracts (CC0 metadata, generated by
   * scripts/fetch-corpus.mjs). Disabled with CORPUS_EXTRA=off. Failures are non-fatal.
   */
  private loadExtraCorpus(): void {
    if ((process.env.CORPUS_EXTRA || '').trim().toLowerCase() === 'off') return;

    const filePath = resolveExtraCorpusPath();
    if (!filePath) {
      console.warn('[corpus] arxiv-abstracts.json not found; continuing with built-in seed documents only.');
      return;
    }

    let records: unknown;
    try {
      records = JSON.parse(readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.warn(`[corpus] Failed to read ${filePath}: ${(err as Error).message}; continuing with seed documents only.`);
      return;
    }
    if (!Array.isArray(records)) {
      console.warn(`[corpus] ${filePath} is not a JSON array; continuing with seed documents only.`);
      return;
    }

    const isNonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
    let loaded = 0;
    let skipped = 0;
    let totalWords = 0;

    for (const rec of records.slice(0, MAX_EXTRA_CORPUS_DOCS)) {
      const r = rec as Record<string, unknown>;
      if (
        !r || typeof r !== 'object' ||
        !isNonEmpty(r.id) || !isNonEmpty(r.title) || !isNonEmpty(r.authorOrSource) ||
        !isNonEmpty(r.text) || !isNonEmpty(r.url) || !r.url.startsWith('https://arxiv.org/abs/') ||
        this.documents.has(r.id)
      ) {
        skipped++;
        continue;
      }
      const { wordCount } = this.indexDocumentInternal(
        { id: r.id, title: r.title, authorOrSource: r.authorOrSource, url: r.url, text: r.text },
        5,
        false
      );
      loaded++;
      totalWords += wordCount;
    }

    if (records.length > MAX_EXTRA_CORPUS_DOCS) skipped += records.length - MAX_EXTRA_CORPUS_DOCS;
    if (skipped > 0) {
      console.warn(`[corpus] Skipped ${skipped} invalid, duplicate or over-cap records from ${filePath}.`);
    }
    if (loaded > 0) {
      this.auditLogs.push({
        timestamp: new Date().toISOString(),
        action: 'indexed',
        docId: 'bulk:arxiv-abstracts',
        title: `Bulk load: ${loaded} arXiv abstracts (CC0 metadata)`,
        wordCount: totalWords
      });
    }
  }
}

/** Upper bound on bundled extra documents, to keep the in-memory index small (512 MB hosts). */
const MAX_EXTRA_CORPUS_DOCS = 1000;

/**
 * Resolves backend/corpus/arxiv-abstracts.json relative to this module. Works from both
 * backend/src (tsx/vitest) and backend/dist (compiled), since both sit one level under backend/.
 */
function resolveExtraCorpusPath(): string | null {
  try {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    const candidate = resolve(moduleDir, '../corpus/arxiv-abstracts.json');
    return existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

// Global singleton instance for the platform
export const defaultCorpusManager = new CorpusIndexManager();
