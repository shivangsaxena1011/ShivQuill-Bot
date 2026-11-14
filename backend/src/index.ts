import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import { config, validateProviderConfiguration, assertProductionReadiness } from './config.js';
import { getDefaultModel } from './llm.js';
import { paraphraseRouter } from './routes/paraphrase.js';
import { grammarRouter } from './routes/grammar.js';
import { humanizeRouter } from './routes/humanize.js';
import { summarizeRouter } from './routes/summarize.js';
import { translateRouter } from './routes/translate.js';
import { originalityRouter } from './routes/originality.js';
import { chatRouter } from './routes/chat.js';
import { tasksRouter } from './routes/tasks.js';
import { suggestionsRouter } from './routes/suggestions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app: Express = express();

// 1. Security & Headers
app.use(helmet({
  contentSecurityPolicy: false // Allows seamless local dev & embedded views
}));

// 2. Strict CORS Configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow local development and local loopback
    if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }
    if (config.corsOrigin && origin === config.corsOrigin) {
      return callback(null, true);
    }
    // Block unauthorized origins in production
    if (config.env === 'production') {
      return callback(new Error('CORS origin rejected by security policy'));
    }
    return callback(null, true);
  },
  credentials: true
}));

// 3. Body Parser with Generous Limit for Document Processing (10mb)
app.use(express.json({ limit: '10mb' }));

// 4. Rate Limiting (Sliding window)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 300, // Limit each IP to 300 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait before retrying.' }
});
app.use('/api/', apiLimiter);

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

// Health & Engine Status Check
app.get('/api/health', (req: Request, res: Response) => {
  const providerStatus = validateProviderConfiguration();
  const isMock = config.requestType === 'MOCK';
  const isUnconfigured = config.requestType === 'UNCONFIGURED';

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'ShivQuill AI Writing Platform',
    version: '2.0.0',
    environment: config.env,
    provider: config.requestType,
    model: getDefaultModel(),
    engineStatus: isMock ? 'mock_test' : isUnconfigured ? 'unconfigured' : 'active',
    isMockMode: isMock,
    isUnconfigured: isUnconfigured,
    providerMessage: providerStatus.message
  });
});

// Serve frontend build if available
const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendDistPath));

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
