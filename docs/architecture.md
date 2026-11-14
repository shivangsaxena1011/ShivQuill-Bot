# ShivQuill Platform System Architecture (v2.0)

## 1. System Topology Overview

ShivQuill is architected as an independent, modular full-stack AI writing platform designed to decouple client interaction from underlying LLM inference providers while guaranteeing zero artificial paywalls or word limits.

```
+-------------------------------------------------------------------------+
|                              Client Layer                               |
|   Vue 3 (Composition API) + TypeScript + Vite + Pinia                   |
|   - Responsive Dual-Panel Writing Workspace & Interactive Token Diffing |
|   - Real-Time Error Banners & Provider Engine Status (Active/Mock/Uncfg)|
|   - Large Document Length Support (Up to 1M Chars / ~150K Words, No Paywalls) |
+-------------------------------------------------------------------------+
                                    |
                            HTTP / REST / JSON
                                    |
+-------------------------------------------------------------------------+
|                           Application Gateway                           |
|   Node.js + Express + TypeScript                                        |
|   - Helmet Security Headers & Production Origin Validation              |
|   - Sliding-Window Rate Limiting (express-rate-limit 300 req/min)        |
|   - 10MB Generous Payload Parser & Strict Zod Validation                |
|   - Fast-Fail Provider Validation (MOCK Forbidden in Production)        |
+-------------------------------------------------------------------------+
         |                        |                          |
+-------------------+   +--------------------+   +------------------------+
| Text Segmentation |   | Async Task Manager |   | Diff & Synonym Engine  |
| - Boundary Guards |   | - UUID Tokening    |   | - Word-Level Edit Map  |
| - Sentence Chunks |   | - 15-Minute TTL    |   | - Token Classification |
| - Rolling Context |   | - Bounded In-Mem   |   | - Interactive Popovers |
+-------------------+   +--------------------+   +------------------------+
                                    |
+-------------------------------------------------------------------------+
|                       AI Orchestration Subsystem                        |
|   - Multi-Provider Adapter (OpenAI, Groq, OpenRouter, Custom vLLM)      |
|   - Strict Error Propagation (No Silent Mock Masking on Real Failures)  |
|   - Invariance Rule Injector (Numbers, Dates, Names, Citations)        |
|   - Invariant Entity Tracking & Semantic Consistency Evaluation        |
|   - Mode & Intensity Tuner (9 Paraphrase Modes + Synonym Slider 1-4)    |
|   - Modular MinHash & K-Gram Shingle Inverted Index for Plagiarism      |
|   - Crossref REST API for Automated DOI Bibliographic Verification      |
|   - Experimental Shannon Entropy & Sentence-Length CV AI Analyzer       |
+-------------------------------------------------------------------------+
```

---

## 2. Core Subsystems

### A. Defensive Sentence & Paragraph Segmentation (`backend/src/segmenter.ts`)
- Utilizes ECMAScript standard `Intl.Segmenter` for locale-aware sentence parsing, with regex fallbacks.
- Strictly guards against the zero-chunk infinite loop flaw (`Math.max(1, chunkSize)`), guaranteeing linear $O(n)$ iteration through text chunks.
- Chunks long multi-paragraph documents seamlessly without any artificial word-count caps.

### B. Diff & Alternative Synonym Engine (`backend/src/diff.ts`)
- Computes exact word-level differences using Myers' diff algorithm.
- Classifies spans into `unchanged`, `synonym`, `added`, `removed`, and `restructured`.
- Generates contextual alternative lists allowing writers to click changed words in the UI and toggle through alternative word choices in real-time.

### C. Multi-Provider LLM Abstraction (`backend/src/llm.ts`)
- Universal client supporting standard OpenAI-compatible completions across OpenAI, Groq (Llama-3.3-70B), OpenRouter, and custom endpoints (vLLM, Ollama).
- Throws explicit `ProviderConfigurationError` when keys are unconfigured, completely preventing silent mock output.
- Isolated mock engine strictly reserved for automated test suites (`REQUEST_TYPE=MOCK`).

### D. Modular Corpus & Shingling Engine (`backend/src/corpus.ts`)
- Modular `CorpusIndexManager` housing real open-access literature (arXiv ResNet, Transformer paper, W3C WCAG, IPCC reports).
- Combines $k$-gram shingling, MinHash 64-hash Jaccard estimation, and inverted indexing.
- Returns character offsets for exact matched passage highlighting in the client.

### E. Originality & Bibliographic Resolution (`backend/src/routes/originality.ts`)
- **AI Detector**: Evaluates Shannon entropy, coefficient of variation ($CV$) of sentence lengths, and Type-Token Ratio ($TTR$). Clearly disclaimed as an experimental heuristic with explicit false-positive warnings.
- **Citation Engine**: Automatically resolves official metadata via Crossref public REST API when a DOI is provided, explicitly distinguishing verified citations from user-supplied inputs.

### F. Document Chunk Orchestrator (`backend/src/chunkOrchestrator.ts`)
- Manages long-document lifecycle via `DocumentProcessingJob`.
- Supports transient chunk retries (up to 2 retries with exponential backoff).
- Implements partial recovery: if individual chunks fail, completed chunks are preserved and the document is recombined cleanly.
- Supports progress tracking and cancellation via `/api/tasks/:id/cancel`.

### G. Advanced Writing Suggestions Subsystem (`backend/src/routes/suggestions.ts`)
- Evaluates documents across Clarity, Conciseness, Vocabulary Repetition, Tone, and Sentence Restructuring.
- Returns character-span-linked actionable diagnostics with in-text replacement suggestions.

