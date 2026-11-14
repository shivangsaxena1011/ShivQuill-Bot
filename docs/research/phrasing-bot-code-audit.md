# Source Code Audit: Phrasing-Bot Reference Repository

- **Repository**: `https://github.com/Krisseck/Phrasing-Bot`
- **License**: MIT License (Copyright (c) 2024 Kristian Polso)
- **Local Reference Copy**: `reference/Phrasing-Bot`

---

## 1. Architectural Walkthrough

### Backend (`src/index.ts` & `src/llm.ts`)
1. **Entry Point (`src/index.ts`)**:
   - Initializes Express application.
   - Applies middleware: `cors()` without restrictions and `bodyParser.json()`.
   - Serves static assets from `frontend/dist`.
   - Exposes three endpoints:
     - `POST /api/start-generation`: Launches asynchronous generation in an in-memory queue.
     - `GET /api/get-generation/:generationId`: Polls status of generation.
     - `GET /api/models`: Lists available models from the configured LLM provider.
2. **Text Processing Pipeline**:
   - Splits incoming prompt by newline into paragraphs.
   - Uses JavaScript's built-in `Intl.Segmenter('en-US', {granularity: 'sentence'})` to parse paragraphs into individual sentences.
   - Chunks sentences using `process.env.SENTENCES_IN_PROMPT`.
3. **LLM Provider Integration (`src/llm.ts`)**:
   - Single OpenAI client instance configured at boot time.
   - Supports 4 provider modes via `REQUEST_TYPE`: `CUSTOM`, `GROQ`, `OPENROUTER`, `OPENAI`.
   - Simple string concatenation prompts defined in `common/prompt-types.ts` and `common/styles.ts`.

### Frontend (`frontend/src/`)
1. **Framework & UI**:
   - Vue 3 with Composition API (`<script setup>`).
   - Bulma CSS framework for styling.
   - Pinia store for managing model lists.
   - Vite for bundling with `vite-plugin-top-level-await` and `vite-plugin-wasm`.
2. **Key Utilities**:
   - `diff.ts`: Uses `diff.diffWords` with a custom merge pass that collapses consecutive alternating deletions and additions separated by a space into unified edit chunks.
   - `backend.ts`: Axios client handling API calls to `/api/start-generation`, `/api/get-generation/:id`, and `/api/models`.
   - `tiktoken`: Runs `cl100k_base` WebAssembly encoder in browser to estimate token counts.

---

## 2. Identified Bugs & Code Defects

1. **Infinite Loop Bug in Sentence Chunking**:
   - Location: `src/index.ts:64-70`
   ```typescript
   let sentenceChunkSize = parseInt(process.env.SENTENCES_IN_PROMPT || '0');
   for (let i = 0; i < sentences.length; i += sentenceChunkSize) { ... }
   ```
   - Defect: If `SENTENCES_IN_PROMPT` is unset, invalid, or `0`, `sentenceChunkSize` is `0`. The loop increment `i += 0` runs indefinitely, hanging the single-threaded Node.js event loop and freezing the server.
2. **In-Memory Memory Leak / Queue Exhaustion**:
   - Location: `src/index.ts:17`
   ```typescript
   let queue = [] as Generation[];
   ```
   - Defect: All completed generations are appended to an unbounded global array. The array is never pruned, expired, or cleaned up. Over time or under load, this results in an out-of-memory (OOM) crash.
3. **Unhandled Promise Rejections in Generation**:
   - Location: `src/index.ts:73`
   ```typescript
   let llmOutput = await getLlmOutput(...);
   ```
   - Defect: If the upstream LLM API throws a 429, 500, or network timeout, the asynchronous error is completely unhandled. The queue entry stays permanently at `done: false`, causing client polling to hang forever.
4. **Race Conditions in Generation ID Assignment**:
   - Location: `src/index.ts:28-33`
   ```typescript
   let generationId = queue.length;
   res.json({ generationId });
   queue.push({ done: false, output: '' });
   ```
   - Defect: Assigning `queue.length` before pushing creates race conditions under concurrent requests where two requests receive the same ID.
5. **No Model Validation**:
   - The user client sends `req.body.model` directly to the provider without validating whether the requested model is permitted or supported.
