#!/usr/bin/env node
/**
 * ShivQuill API key setup: writes keys into the project-root .env (never commits or prints them).
 *
 *   npm run setup:keys            interactive setup (hidden input for secrets)
 *   npm run setup:keys -- --check show which keys are set (masked) and exit
 *
 * Press Enter to keep a current value, type "-" to clear it.
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env');

const PROVIDERS = {
  GROQ: { label: 'Groq (free tier available)', keyVar: 'GROQ_API_KEY', modelVar: 'GROQ_MODEL', model: 'openai/gpt-oss-120b', url: 'https://console.groq.com/keys', test: 'https://api.groq.com/openai/v1/models' },
  OPENAI: { label: 'OpenAI', keyVar: 'OPENAI_API_KEY', modelVar: 'OPENAI_MODEL', model: 'gpt-4o-mini', url: 'https://platform.openai.com/api-keys', test: 'https://api.openai.com/v1/models' },
  OPENROUTER: { label: 'OpenRouter', keyVar: 'OPENROUTER_API_KEY', modelVar: 'OPENROUTER_MODEL', model: 'meta-llama/llama-3.3-70b-instruct', url: 'https://openrouter.ai/keys', test: 'https://openrouter.ai/api/v1/key' },
  CUSTOM: { label: 'Custom OpenAI-compatible endpoint (Ollama, vLLM, LM Studio…)', keyVar: 'CUSTOM_API_KEY', modelVar: 'CUSTOM_API_MODEL', model: 'llama3', url: '', test: '' }
};

const SEARCH_KEYS = [
  { name: 'GOOGLE_CSE_KEY', label: 'Google Programmable Search API key', secret: true, help: 'https://developers.google.com/custom-search/v1/overview (100 free queries/day)' },
  { name: 'GOOGLE_CSE_ID', label: 'Google search engine ID (cx)', secret: false, help: 'https://programmablesearchengine.google.com (create an engine that searches the entire web)' },
  { name: 'BRAVE_SEARCH_API_KEY', label: 'Brave Search API key', secret: true, help: 'https://brave.com/search/api/ (free plan)' },
  { name: 'SEARXNG_URL', label: 'SearXNG instance URL (e.g. http://localhost:8080)', secret: false, help: 'self-hosted, open source; JSON output must be enabled' }
];
const OTHER_KEYS = [
  { name: 'OPENALEX_API_KEY', label: 'OpenAlex API key', secret: true, help: 'https://openalex.org/rest-api (free; avoids anonymous rate limits)' },
  { name: 'PLAGIARISM_CONTACT', label: 'Contact (email or URL) sent to Wikipedia/Crossref/arXiv in the User-Agent', secret: false, help: 'optional; their API etiquette asks for one' }
];


// ---------------------------------------------------------------------------------------------
function readEnv() {
  const text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    // Same rules as dotenv: optional "export ", quoted values kept verbatim, " #comment" after unquoted values
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const raw = m[2];
    const q = raw.match(/^(['"`])([\s\S]*?)\1(\s+#.*)?$/);
    values[m[1]] = q ? q[2] : raw.replace(/\s+#.*$/, '');
  }
  return { text, values };
}

/** dotenv has no escapes: quote with a quote character the value doesn't contain. */
function quote(v) {
  if (!/[\s#"'`=]/.test(v)) return v;
  for (const q of ["'", '"', '`']) if (!v.includes(q)) return `${q}${v}${q}`;
  throw new Error('That value contains every kind of quote character and cannot be stored safely in .env.');
}

/** Updates/adds/removes KEY=value lines, keeping every other line (and comments) untouched. */
function writeEnv(originalText, changes) {
  const eol = originalText.includes('\r\n') ? '\r\n' : '\n';
  const lines = originalText ? originalText.split(/\r?\n/) : [];
  const done = new Set();
  const out = [];
  for (const line of lines) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=/);
    if (m && m[1] in changes) {
      done.add(m[1]);
      if (changes[m[1]] !== null) out.push(`${m[1]}=${quote(changes[m[1]])}`);
      continue;
    }
    out.push(line);
  }
  const added = Object.entries(changes).filter(([k, v]) => !done.has(k) && v !== null);
  if (added.length) {
    if (out.length && out[out.length - 1].trim() !== '') out.push('');
    out.push('# Added by npm run setup:keys');
    for (const [k, v] of added) out.push(`${k}=${quote(v)}`);
  }
  let text = out.join(eol);
  if (!text.endsWith(eol)) text += eol;
  if (fs.existsSync(ENV_PATH)) fs.copyFileSync(ENV_PATH, `${ENV_PATH}.bak`);
  fs.writeFileSync(ENV_PATH, text, { mode: 0o600 });
}

const mask = v => (!v ? 'not set' : v.length <= 8 ? 'set (••••)' : `set (${v.slice(0, 4)}…${v.slice(-4)})`);

function printStatus(values) {
  const type = values.REQUEST_TYPE || '(auto-detect from keys)';
  console.log(`\n  AI provider (REQUEST_TYPE): ${type}`);
  for (const [id, p] of Object.entries(PROVIDERS)) {
    console.log(`    ${id.padEnd(10)} ${p.keyVar}: ${mask(values[p.keyVar])}${values[p.modelVar] ? `, model ${values[p.modelVar]}` : ''}`);
  }
  if (values.CUSTOM_API_BASE_URL) console.log(`    CUSTOM_API_BASE_URL: ${values.CUSTOM_API_BASE_URL}`);
  console.log('\n  Plagiarism web search (optional; DuckDuckGo is used when none is set):');
  for (const k of SEARCH_KEYS) console.log(`    ${k.name}: ${k.secret ? mask(values[k.name]) : values[k.name] || 'not set'}`);
  console.log('\n  Other:');
  for (const k of OTHER_KEYS) console.log(`    ${k.name}: ${k.secret ? mask(values[k.name]) : values[k.name] || 'not set'}`);
  console.log('');
}

// ---------------------------------------------------------------------------------------------
const isTTY = Boolean(process.stdin.isTTY);
// historySize 0: otherwise pressing Up at a later prompt would show a key typed earlier, in plain text
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: isTTY, historySize: 0 });
let muted = false;
let currentPrompt = '';
const origWrite = rl._writeToOutput?.bind(rl) ?? (s => process.stdout.write(s));
// While a secret is typed, show "*" instead of the characters (also on line redraws)
rl._writeToOutput = s => {
  if (!muted) return origWrite(s);
  if (currentPrompt && s.includes(currentPrompt)) return origWrite(s.replace(currentPrompt + rl.line, currentPrompt + '*'.repeat(rl.line.length)));
  if (/^[\r\n]+$/.test(s)) return origWrite(s);
  return origWrite('*'.repeat(s.length));
};
// Lines are queued, so answers that arrive early (pasted or piped input) are never lost
const pending = [];
let waiter = null;
let closed = false;
rl.on('line', line => (waiter ? (waiter(line), (waiter = null)) : pending.push(line)));
rl.on('close', () => {
  closed = true;
  if (waiter) waiter(''), (waiter = null);
});
const ask = (q, { secret = false } = {}) =>
  new Promise(resolve => {
    currentPrompt = q;
    rl.setPrompt(q);
    rl.prompt();
    muted = secret && isTTY;
    const done = answer => {
      muted = false;
      currentPrompt = '';
      if (!isTTY) process.stdout.write('\n');
      resolve(String(answer).trim());
    };
    if (pending.length) done(pending.shift());
    else if (closed) done('');
    else waiter = done;
  });

let warnedVisible = false;
async function askValue(label, current, { secret, help, fallback } = {}) {
  if (help) console.log(`    ${help}`);
  if (secret && !isTTY && !warnedVisible && process.stdout.isTTY) {
    // e.g. Git Bash (mintty) gives Node a non-TTY stdin, so typing can't be hidden there
    warnedVisible = true;
    console.log('    ⚠ This terminal cannot hide what you type, so keys will be visible on screen.');
    console.log('      For hidden input, run it from PowerShell or Windows Terminal, or with: winpty npm run setup:keys');
  }
  const shown = secret ? mask(current) : current || (fallback ? `default ${fallback}` : 'not set');
  const answer = await ask(`  ${label} [${shown}] (Enter = keep, "-" = clear): `, { secret });
  if (answer === '') return undefined;
  if (answer === '-') return null;
  return answer;
}

async function testAiKey(providerId, key, values) {
  const p = PROVIDERS[providerId];
  const url = providerId === 'CUSTOM' ? `${(values.CUSTOM_API_BASE_URL || '').replace(/\/$/, '')}/models` : p.test;
  if (!url || !/^https?:\/\//.test(url)) return console.log('  (no test URL for this provider)');
  try {
    const res = await fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(10000) });
    if (res.ok) console.log(`  ✓ ${p.label}: key accepted (HTTP ${res.status}).`);
    else if (res.status === 401 || res.status === 403) console.log(`  ✗ ${p.label}: key rejected (HTTP ${res.status}). Check that you copied the whole key.`);
    else console.log(`  ? ${p.label}: unexpected HTTP ${res.status}; the key may still be fine.`);
  } catch (err) {
    console.log(`  ? Could not reach ${url}: ${err.message}`);
  }
}

async function main() {
  const { text, values } = readEnv();
  if (process.argv.includes('--check')) {
    console.log(`\nKeys in ${ENV_PATH}${fs.existsSync(ENV_PATH) ? '' : ' (file does not exist yet)'}:`);
    printStatus(values);
    rl.close();
    return;
  }

  console.log('\nShivQuill API key setup');
  console.log(`Keys are saved to ${ENV_PATH} (git-ignored). A backup is written to .env.bak.`);
  printStatus(values);
  const changes = {};

  // 1. AI provider
  console.log('1) AI model provider — powers the AI detector, paraphraser, grammar checker and other AI tools');
  const ids = Object.keys(PROVIDERS);
  ids.forEach((id, i) => console.log(`   ${i + 1}. ${PROVIDERS[id].label}`));
  console.log(`   ${ids.length + 1}. Offline mock mode (no key, simulated answers; never allowed in production)`);
  console.log('   Enter = keep current');
  const choice = await ask('  Choose 1-5: ');
  const n = parseInt(choice, 10);
  let chosen = null;
  if (n >= 1 && n <= ids.length) {
    chosen = ids[n - 1];
    const p = PROVIDERS[chosen];
    changes.REQUEST_TYPE = chosen;
    if (chosen === 'CUSTOM') {
      const base = await askValue('Base URL (OpenAI-compatible, e.g. http://localhost:11434/v1)', values.CUSTOM_API_BASE_URL, {});
      if (base !== undefined) changes.CUSTOM_API_BASE_URL = base;
    }
    const key = await askValue(`${p.keyVar}`, values[p.keyVar], { secret: true, help: p.url ? `Get a key: ${p.url}` : 'Leave empty if your endpoint needs no key' });
    if (key !== undefined) changes[p.keyVar] = key;
    const model = await askValue(`${p.modelVar}`, values[p.modelVar], { fallback: p.model });
    if (model !== undefined) changes[p.modelVar] = model;
  } else if (n === ids.length + 1) {
    changes.REQUEST_TYPE = 'MOCK';
  }

  // 2. Web search for plagiarism
  console.log('\n2) Plagiarism web search (optional). Without keys, free DuckDuckGo results are used (can be throttled).');
  const wantSearch = (await ask('  Configure web search keys now? (y/N): ')).toLowerCase().startsWith('y');
  if (wantSearch) {
    for (const k of SEARCH_KEYS) {
      const v = await askValue(k.label, values[k.name], { secret: k.secret, help: k.help });
      if (v !== undefined) changes[k.name] = v;
    }
  }

  // 3. OpenAlex + contact
  console.log('\n3) Scholarly search');
  for (const k of OTHER_KEYS) {
    const v = await askValue(k.label, values[k.name], { secret: k.secret, help: k.help });
    if (v !== undefined) changes[k.name] = v;
  }

  if (!Object.keys(changes).length) {
    console.log('\nNothing changed.');
    rl.close();
    return;
  }
  writeEnv(text, changes);
  const after = readEnv().values;
  console.log(`\nSaved ${Object.keys(changes).length} setting(s) to ${ENV_PATH}.`);
  printStatus(after);

  const provider = after.REQUEST_TYPE && PROVIDERS[after.REQUEST_TYPE] ? after.REQUEST_TYPE : null;
  if (provider && (after[PROVIDERS[provider].keyVar] || provider === 'CUSTOM')) {
    const test = (await ask('Test the AI key now with one request to the provider? (Y/n): ')).toLowerCase();
    if (!test.startsWith('n')) await testAiKey(provider, after[PROVIDERS[provider].keyVar], after);
  }
  console.log('\nRestart the server to use the new keys. On Render, set the same variables in the dashboard (see docs/api-keys.md).\n');
  rl.close();
}

main().catch(err => {
  console.error(err);
  rl.close();
  process.exit(1);
});
