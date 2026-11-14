# ShivQuill Platform System Architecture

## 1. System Topology Overview

ShivQuill is architected as an independent, modular full-stack AI writing platform designed to decouple client interaction from underlying LLM inference providers.

```
+-------------------------------------------------------------------------+
|                              Client Layer                               |
|   Vue 3 (Composition API) + TypeScript + Vite + Pinia                   |
|   - Responsive Dual-Panel Writing Workspace & Interactive Token Diffing |
|   - Real-Time Error Banners & Provider Health Badges                    |
+-------------------------------------------------------------------------+
                                    |
                            HTTP / REST / JSON
                                    |
+-------------------------------------------------------------------------+
|                           Application Gateway                           |
|   Node.js + Express + TypeScript                                        |
|   - Helmet Security Headers & Production Origin Validation              |
|   - Sliding-Window Rate Limiting (express-rate-limit)                    |
|   - Strict Zod Request Payload Validation                               |
+-------------------------------------------------------------------------+
         |                        |                          |
+-------------------+   +--------------------+   +------------------------+
| Text Segmentation |   | Async Task Manager |   | Diff & Synonym Engine  |
| - Boundary Guards |   | - UUID Tokening    |   | - Word-Level Edit Map  |
| - Sentence Chunks |   | - 15-Minute TTL    |   | - Token Classification |
| - Zero-Bug Fixed  |   | - Bounded In-Mem   |   | - Interactive Popovers |
+-------------------+   +--------------------+   +------------------------+
                                    |
+-------------------------------------------------------------------------+
|                       AI Orchestration Subsystem                        |
|   - Multi-Provider Adapter (OpenAI, Groq, OpenRouter, Custom vLLM)      |
|   - Strict Error Throwing (No Silent Mock Fallbacks on API Failures)    |
|   - Invariance Rule Injector (Numbers, Dates, Names, Citations)        |
|   - Mode & Intensity Tuner (9 Paraphrase Modes + Synonym Slider 1-4)    |
|   - Local K-Gram Shingle Corpus Engine for Authentic Plagiarism Matching|
|   - Shannon Entropy & Burstiness Statistical AI Detector                |
+-------------------------------------------------------------------------+
```

---

## 2. Core Subsystems

### A. Defensive Sentence & Paragraph Segmentation (`backend/src/segmenter.ts`)
- Utilizes ECMAScript standard `Intl.Segmenter` for locale-aware sentence parsing, with regex fallbacks.
- Strictly guards against the zero-chunk infinite loop flaw (`Math.max(1, chunkSize)`), guaranteeing linear $O(n)$ iteration through text chunks.

### B. Diff & Alternative Synonym Engine (`backend/src/diff.ts`)
- Computes exact word-level differences using Myers' diff algorithm.
- Classifies spans into `unchanged`, `synonym`, `added`, `removed`, and `restructured`.
- Generates contextual alternative lists allowing writers to click changed words in the UI and toggle through alternative word choices in real-time.

### C. Multi-Provider LLM Abstraction (`backend/src/llm.ts`)
- Universal client supporting standard OpenAI-compatible completions across OpenAI, Groq (Llama-3.3-70B), OpenRouter, and custom endpoints (vLLM, Ollama).
- Throws explicit `ProviderConfigurationError` when keys are unconfigured, completely preventing silent mock output.
- Isolated mock engine strictly reserved for automated test suites (`REQUEST_TYPE=MOCK`).

### D. Authentic Corpus Comparison (`backend/src/corpus.ts`)
- Houses local synthetic reference documents.
- Uses k-gram shingling to compute genuine overlap without fabricating matches or URLs.
