import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';

import { config, validateProviderConfiguration, assertProductionReadiness } from './config.js';
import { getDefaultModel, isModelAllowed } from './llm.js';
import { paraphraseRouter } from './routes/paraphrase.js';
import { grammarRouter } from './routes/grammar.js';
import { humanizeRouter } from './routes/humanize.js';
import { summarizeRouter } from './routes/summarize.js';
import { translateRouter } from './routes/translate.js';
import { originalityRouter } from './routes/originality.js';
import { chatRouter } from './routes/chat.js';
import { tasksRouter } from './routes/tasks.js';
import { suggestionsRouter } from './routes/suggestions.js';
import { toneRouter } from './routes/tone.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app: Express = express();

// Behind Render / other reverse proxies the client IP arrives in X-Forwarded-For.
// Trusting one hop makes rate limiting per-client instead of per-proxy.
app.set('trust proxy', config.trustProxy);

// 1. Security & Hardened Headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: [
        "'self'",
        ...(config.env === 'production' ? [] : ['http://localhost:*', 'http://127.0.0.1:*']),
        ...config.corsOrigins
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: config.env === 'production' ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false
}));

// 2. Strict CORS Configuration
const isLocalOrigin = (origin: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

app.use(cors((req, callback) => {
  const origin = req.headers.origin;
  let allowed = false;
  if (!origin) {
    allowed = true; // same-origin navigation, curl, health checks
  } else {
    let sameHost = false;
    try {
      sameHost = new URL(origin).host === req.headers.host; // frontend served by this server
    } catch {
      sameHost = false;
    }
    allowed =
      sameHost ||
      config.corsOrigins.includes(origin) ||
      (config.env !== 'production' && isLocalOrigin(origin));
  }

  if (!allowed && config.env === 'production') {
    return callback(new Error('CORS origin rejected by security policy'));
  }
  callback(null, { origin: allowed, credentials: true });
}));

// 2b. Gzip responses (large JSON such as diff spans shrinks ~5-10x). Streams are never buffered.
app.use(compression({
  filter: (req, res) => {
    if (String(res.getHeader('Content-Type') || '').includes('text/event-stream')) return false;
    if (req.query.stream === '1' || (req.headers.accept || '').includes('text/event-stream')) return false;
    return compression.filter(req, res);
  }
}));

// 4. Rate Limiting
// General limit for all API traffic (includes cheap GETs such as task polling)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait before retrying.' }
});
app.use('/api/', apiLimiter);

// Stricter limit for endpoints that spend AI provider tokens
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.aiRequestsPerMinute,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI request limit reached. Please wait a minute and try again.' }
});
// Applies to every POST under these prefixes (e.g. /api/paraphrase/sentence, /api/tone/rewrite),
// except job cancellation, which must always be allowed.
const AI_PREFIXES = ['/api/paraphrase', '/api/grammar', '/api/humanize', '/api/summarize', '/api/translate', '/api/chat', '/api/suggestions', '/api/tone'];
app.use((req: Request, res: Response, next: NextFunction) => {
  // Express routing is case-insensitive, so the match must be too (/API/Paraphrase reaches the same router)
  const reqPath = req.path.toLowerCase();
  if (req.method !== 'POST' || reqPath.includes('/cancel')) return next();
  if (AI_PREFIXES.some(p => reqPath === p || reqPath.startsWith(`${p}/`))) return aiLimiter(req, res, next);
  return next();
});

// Body parser (10mb for document processing). Registered after the rate limiters so rejected
// clients do not make the server buffer and parse large bodies first.
app.use(express.json({ limit: '10mb' }));

// 4b. Model allowlist: clients may not select arbitrary (e.g. expensive) provider models
app.use('/api/', (req: Request, res: Response, next: NextFunction) => {
  const requested = req.body?.model;
  if (requested !== undefined && (typeof requested !== 'string' || !isModelAllowed(requested))) {
    return res.status(400).json({
      error: `Model '${String(requested)}' is not allowed. Configure ALLOWED_MODELS on the server to permit it.`
    });
  }
  return next();
});

// 5. Mount Feature Routers
app.use('/api/paraphrase', paraphraseRouter);
app.use('/api/grammar', grammarRouter);
app.use('/api/humanize', humanizeRouter);
app.use('/api/summarize', summarizeRouter);
app.use('/api/translate', translateRouter);
app.use('/api/originality', originalityRouter);
app.use('/api/chat', chatRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/suggestions', suggestionsRouter);
app.use('/api/tone', toneRouter);

// Health & Engine Status Check
app.get('/api/health', (req: Request, res: Response) => {
  const providerStatus = validateProviderConfiguration();
  const isMock = config.requestType === 'MOCK';
  const isUnconfigured = config.requestType === 'UNCONFIGURED';

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'ShivQuill AI Writing Platform',
    version: '2.3.0',
    environment: config.env,
    provider: config.requestType,
    providerStatus: isMock ? 'mock_simulation' : isUnconfigured ? 'unconfigured' : providerStatus.ready ? 'ready' : 'error',
    model: getDefaultModel(),
    allowedModels: Array.from(new Set([getDefaultModel(), ...config.allowedModels])),
    engineStatus: isMock ? 'mock_test' : isUnconfigured ? 'unconfigured' : 'active',
    isMockMode: isMock,
    isUnconfigured: isUnconfigured,
    providerMessage: providerStatus.message
  });
});

// Serve frontend build if available
const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
// Hashed build assets never change → cache for a year. index.html / sw.js must always revalidate
// so users get new releases immediately.
app.use(express.static(frontendDistPath, {
  setHeaders(res, filePath) {
    if (/[\\/]assets[\\/]/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Unknown API routes get a JSON 404 instead of Express's HTML page
app.use('/api', (req: Request, res: Response) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

app.get('*', (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(frontendDistPath, 'index.html'), err => {
    if (err) {
      res.status(200).send('ShivQuill API Server Online. Frontend build not found at frontend/dist.');
    }
  });
});

// Centralized Safe Error Handling Middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err?.message === 'CORS origin rejected by security policy') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  console.error('Unhandled Application Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: config.env === 'development' ? err.message : 'An unexpected error occurred'
  });
});

// Server Startup
if (process.env.NODE_ENV !== 'test') {
  assertProductionReadiness();
  const validation = validateProviderConfiguration();
  console.log(`[ShivQuill Backend] Initializing in ${config.env.toUpperCase()} environment...`);
  console.log(`[ShivQuill Backend] Provider: ${config.requestType} (${getDefaultModel()})`);
  console.log(`[ShivQuill Backend] Status: ${validation.message}`);

  app.listen(config.port, () => {
    console.log(`[ShivQuill Backend] Server listening on http://localhost:${config.port}`);
  });
}
