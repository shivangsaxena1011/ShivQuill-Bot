import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { config } from '../config.js';
import { CitationResponse } from '../types.js';
import { defaultCorpusManager } from '../corpus.js';
import { formatCitation, parseAuthorName, CitationSource, CitationAuthor } from '../citation.js';
import { scanForPlagiarism } from '../plagiarism/engine.js';
import { detectAiText, MIN_WORDS } from '../aiDetector.js';
import { abortOnClientDisconnect, isAbortError } from '../requestAbort.js';
import { wantsStream, openSse, finish, fail, SseChannel } from '../sse.js';

export const originalityRouter = Router();

/**
 * Timing-safe authentication middleware for corpus administration
 */
function verifyCorpusAdminAuth(req: Request, res: Response, next: NextFunction) {
  const configuredKey = config.corpusAdminApiKey;
  if (!configuredKey) {
    return res.status(503).json({
      error: 'Corpus administration is disabled. Configure CORPUS_ADMIN_KEY in environment to enable index mutations.'
    });
  }

  const authHeader = req.headers['authorization'] || req.headers['x-admin-key'];
  let providedKey = '';

  if (typeof authHeader === 'string') {
    providedKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  }

  if (!providedKey) {
    return res.status(401).json({ error: 'Unauthorized: Missing corpus administration key.' });
  }

  const keyBuffer = Buffer.from(providedKey);
  const targetBuffer = Buffer.from(configuredKey);

  if (keyBuffer.length !== targetBuffer.length || !crypto.timingSafeEqual(keyBuffer, targetBuffer)) {
    return res.status(403).json({ error: 'Forbidden: Invalid corpus administration key.' });
  }

  return next();
}

// ----------------------------------------------------
// 1. AI Detector Endpoint (language-model judgement + writing statistics)
// ----------------------------------------------------
const aiDetectorSchema = z.object({
  text: z
    .string()
    .max(200000, 'Text exceeds the 200,000 character limit per scan')
    .refine(t => (t.match(/[\p{L}\p{M}\p{N}]+/gu) || []).length >= MIN_WORDS, `Add at least ${MIN_WORDS} words so the detector has enough text to analyze`),
  model: z.string().optional()
});

originalityRouter.post('/detector', async (req: Request, res: Response) => {
  const signal = abortOnClientDisconnect(res);
  let stream: SseChannel | null = null;
  try {
    const { text, model } = aiDetectorSchema.parse(req.body);
    if (wantsStream(req)) stream = openSse(res);
    const result = await detectAiText(text, { model, signal, onStatus: message => stream?.send('status', { message }) });
    return finish(res, stream, result);
  } catch (error: any) {
    if (signal.aborted || isAbortError(error)) {
      stream?.end();
      return;
    }
    if (error instanceof z.ZodError) {
      return fail(res, stream, 400, error.errors[0].message);
    }
    console.error('AI detection error:', error?.message || error);
    return fail(res, stream, 500, 'AI detection analysis failed');
  }
});

// ----------------------------------------------------
// 2. Plagiarism Checker Endpoint (free web, Wikipedia & scholarly search + local library)
// ----------------------------------------------------
const plagiarismSchema = z.object({
  text: z.string().min(10, 'Text too short for plagiarism check').max(300000, 'Text exceeds the 300,000 character limit per scan'),
  excludeQuotes: z.boolean().optional().default(false)
});

originalityRouter.post('/plagiarism', async (req: Request, res: Response) => {
  const signal = abortOnClientDisconnect(res);
  let stream: SseChannel | null = null;
  try {
    const { text, excludeQuotes } = plagiarismSchema.parse(req.body);
    if (wantsStream(req)) stream = openSse(res);
    const report = await scanForPlagiarism(text, {
      excludeQuotes,
      signal,
      onStatus: message => stream?.send('status', { message })
    });
    return finish(res, stream, report);
  } catch (error: any) {
    if (signal.aborted || isAbortError(error)) {
      stream?.end();
      return;
    }
    if (error instanceof z.ZodError) {
      return fail(res, stream, 400, error.errors[0].message);
    }
    console.error('Plagiarism scan error:', error?.message || error);
    return fail(res, stream, 500, 'Plagiarism check failed');
  }
});

// Corpus Management Endpoints
originalityRouter.get('/corpus', (req: Request, res: Response) => {
  res.json({
    documentCount: defaultCorpusManager.getDocumentCount(),
    totalShingles: defaultCorpusManager.getTotalShinglesCount(),
    // Metadata only: full texts would make this response large for no benefit
    documents: defaultCorpusManager.getAllDocuments().map(({ id, title, authorOrSource, url }) => ({ id, title, authorOrSource, url }))
  });
});

originalityRouter.get('/corpus/audit', verifyCorpusAdminAuth, (req: Request, res: Response) => {
  res.json({
    auditLogs: defaultCorpusManager.getAuditLogs()
  });
});

const indexDocumentSchema = z.object({
  id: z.string().min(1, 'ID is required').max(100, 'ID cannot exceed 100 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'ID must contain only alphanumeric characters, underscores, and hyphens'),
  title: z.string().min(1, 'Title is required').max(200, 'Title cannot exceed 200 characters'),
  authorOrSource: z.string().min(1, 'Author/Source is required').max(200, 'Author cannot exceed 200 characters'),
  url: z.string().url('Must be a valid URL').max(1000, 'URL too long')
    .refine((val) => {
      try {
        const u = new URL(val);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
        const host = u.hostname.toLowerCase();
        // SSRF prevention: reject localhost, loopback, link-local, and private RFC1918 subnets
        // URL.hostname keeps IPv6 brackets ("[::1]")
        if (host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || host === '[::]') {
          return false;
        }
        if (/^(127|0)\.\d+\.\d+\.\d+$/.test(host)) return false; // loopback, "this network"
        if (/^169\.254\.\d+\.\d+$/.test(host)) return false; // link-local incl. cloud metadata
        if (/^\[(f[cd]|fe[89ab])[0-9a-f]*:/.test(host)) return false; // IPv6 unique-local / link-local
        if (/^\[::ffff:/.test(host)) return false; // IPv4-mapped IPv6
        if (/^10\.\d+\.\d+\.\d+$/.test(host)) return false;
        if (/^192\.168\.\d+\.\d+$/.test(host)) return false;
        if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) return false;
        return true;
      } catch {
        return false;
      }
    }, 'URL must use HTTP/HTTPS and cannot target private or local networks'),
  text: z.string().min(20, 'Text must be at least 20 characters').max(50000, 'Text cannot exceed 50,000 characters per document')
});

originalityRouter.post('/corpus', verifyCorpusAdminAuth, (req: Request, res: Response) => {
  try {
    const doc = indexDocumentSchema.parse(req.body);

    // Duplicate title check for distinct IDs
    const existingByTitle = defaultCorpusManager.findDocumentByTitle(doc.title);
    if (existingByTitle && existingByTitle.id !== doc.id) {
      return res.status(409).json({
        error: `A document with the title '${doc.title}' already exists with ID '${existingByTitle.id}'.`
      });
    }

    const action = defaultCorpusManager.indexDocument(doc);
    return res.json({
      status: action,
      documentId: doc.id,
      totalDocuments: defaultCorpusManager.getDocumentCount()
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    return res.status(500).json({ error: 'Failed to index document' });
  }
});

// ----------------------------------------------------
// 3. Citation Generator Endpoint (With Real Metadata Lookup)
// ----------------------------------------------------
const citationSchema = z.object({
  sourceType: z.enum(['website', 'journal', 'book']).default('website'),
  style: z.enum(['APA', 'MLA', 'Chicago', 'Harvard']).default('APA'),
  url: z.string().max(2000).optional(),
  doi: z.string().max(300).optional(),
  isbn: z.string().max(40).optional(),
  title: z.string().max(1000).optional(),
  authors: z.array(z.string().max(200)).max(100).optional(),
  year: z.string().max(20).optional(),
  publisher: z.string().max(300).optional(),
  containerTitle: z.string().max(300).optional(),
  volume: z.string().max(50).optional(),
  issue: z.string().max(50).optional(),
  pages: z.string().max(50).optional()
});

/**
 * Attempts real DOI metadata resolution via Crossref REST API
 */
async function fetchCrossrefMetadata(doiQuery: string): Promise<any | null> {
  const cleanDoi = doiQuery
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .trim();

  if (!cleanDoi.match(/^10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+$/)) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000); // 4-second timeout

    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`, {
      headers: { 'User-Agent': 'ShivQuill-Academic-Citation-Engine/2.0 (mailto:support@shivquill.local)' },
      signal: controller.signal
    });
    try {
      if (!res.ok) return null;
      const data: any = await res.json();
      return data.message || null;
    } finally {
      // The timer must also cover reading the body, not just the response headers
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

/** Normalizes and checksum-validates an ISBN-10 or ISBN-13. Returns null when invalid. */
export function normalizeIsbn(raw: string): string | null {
  const isbn = raw.replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = isbn.split('').reduce((acc, ch, i) => acc + (ch === 'X' ? 10 : Number(ch)) * (10 - i), 0);
    return sum % 11 === 0 ? isbn : null;
  }
  if (/^\d{13}$/.test(isbn)) {
    const sum = isbn.split('').reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
    return sum % 10 === 0 ? isbn : null;
  }
  return null;
}

/** Looks up book metadata by ISBN using the free OpenLibrary Books API. */
async function fetchOpenLibraryBook(isbn: string): Promise<any | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`,
      { headers: { 'User-Agent': 'ShivQuill-Citation-Engine/2.2' }, signal: controller.signal }
    );
    try {
      if (!res.ok) return null;
      const data: any = await res.json();
      return data[`ISBN:${isbn}`] || null;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

originalityRouter.post('/citation', async (req: Request, res: Response) => {
  try {
    const data = citationSchema.parse(req.body);

    const source: CitationSource = {
      sourceType: data.sourceType,
      title: data.title?.trim() || '',
      authors: (data.authors || []).map(parseAuthorName).filter((a): a is CitationAuthor => a !== null),
      year: data.year?.trim() || 'n.d.',
      containerTitle: data.containerTitle?.trim() || undefined,
      publisher: data.publisher?.trim() || undefined,
      volume: data.volume?.trim() || undefined,
      issue: data.issue?.trim() || undefined,
      pages: data.pages?.trim() || undefined,
      doi: data.doi?.trim() || undefined,
      url: data.url?.trim() || undefined
    };

    let isVerified = false;
    let sourceOrigin: 'crossref_doi' | 'openlibrary_isbn' | 'user_supplied' = 'user_supplied';
    let retrievedMetadata: CitationResponse['retrievedMetadata'];

    const targetDoi = data.doi || (data.url?.includes('doi.org/') ? data.url : undefined);
    if (targetDoi) {
      const meta = await fetchCrossrefMetadata(targetDoi);
      if (meta) {
        isVerified = true;
        sourceOrigin = 'crossref_doi';
        if (meta.title?.[0]) source.title = meta.title[0];
        if (Array.isArray(meta.author) && meta.author.length > 0) {
          source.authors = meta.author
            .map((a: any) => (a.family ? { family: a.family, given: a.given || '' } : a.name ? parseAuthorName(a.name) : null))
            .filter(Boolean);
        }
        const year = meta.issued?.['date-parts']?.[0]?.[0] || meta.published?.['date-parts']?.[0]?.[0];
        if (year) source.year = String(year);
        if (meta['container-title']?.[0]) source.containerTitle = meta['container-title'][0];
        if (meta.publisher) source.publisher = meta.publisher;
        if (meta.volume) source.volume = String(meta.volume);
        if (meta.issue) source.issue = String(meta.issue);
        if (meta.page) source.pages = String(meta.page).replace('-', '–');
        if (meta.DOI) source.doi = meta.DOI;
        if (meta.type === 'journal-article') source.sourceType = 'journal';
        else if (typeof meta.type === 'string' && meta.type.startsWith('book')) source.sourceType = 'book';

        retrievedMetadata = {
          doi: meta.DOI,
          containerTitle: source.containerTitle,
          publishedDate: source.year,
          publisher: meta.publisher
        };
      }
    }

    if (!isVerified && data.isbn) {
      const isbn = normalizeIsbn(data.isbn);
      if (!isbn) {
        return res.status(400).json({ error: 'That ISBN is not valid. Check the digits (10 or 13).' });
      }
      const book = await fetchOpenLibraryBook(isbn);
      if (book) {
        isVerified = true;
        sourceOrigin = 'openlibrary_isbn';
        source.sourceType = 'book';
        source.title = [book.title, book.subtitle].filter(Boolean).join(': ') || source.title;
        if (Array.isArray(book.authors) && book.authors.length) {
          source.authors = book.authors.map((a: any) => parseAuthorName(String(a.name || ''))).filter(Boolean);
        }
        const year = String(book.publish_date || '').match(/\b(1[5-9]\d{2}|20\d{2})\b/);
        if (year) source.year = year[1];
        if (book.publishers?.[0]?.name) source.publisher = book.publishers[0].name;
        if (book.url) source.url = book.url;
        retrievedMetadata = { publisher: source.publisher, publishedDate: source.year };
      }
    }

    if (!source.title) source.title = 'Untitled work';

    const { inTextCitation, fullBibliographyEntry } = formatCitation(data.style, source);

    const response: CitationResponse & { resolved: CitationSource } = {
      style: data.style,
      inTextCitation,
      fullBibliographyEntry,
      sourceType: source.sourceType,
      isVerified,
      sourceOrigin,
      retrievedMetadata,
      // Structured fields so the UI can show/fill exactly what was used
      resolved: source
    };

    return res.json(response);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    return res.status(500).json({ error: 'Citation generation failed' });
  }
});
