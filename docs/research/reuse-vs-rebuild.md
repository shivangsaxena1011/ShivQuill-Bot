# Architectural Decision Record: Reuse vs. Rebuild

## 1. Context & Objective

We are constructing an independent, production-grade AI writing platform that matches the capabilities of QuillBot, using Krisseck's open-source `Phrasing-Bot` as an architectural reference.

---

## 2. Component Evaluation

### A. Components to Preserve and Adapt
1. **Sentence Segmentation Strategy**:
   - The use of `Intl.Segmenter('en-US', {granularity: 'sentence'})` is a clean, native ECMAScript standard that eliminates heavy NLP dependencies for sentence splitting.
   - *Enhancement*: Add fallback handling, safe chunking guards (`Math.max(1, chunk)`), and cross-paragraph boundary management.
2. **Text Diff Algorithm (`diff.ts`)**:
   - The pattern of using `diff.diffWords` combined with adjacent edit compression is effective for highlighting edits.
   - *Enhancement*: Adapt this logic into an interactive Vue component supporting inline click-to-replace, color classification, and token statistics.
3. **Core Technology Stack**:
   - **Frontend**: Vue 3 + TypeScript + Vite + Pinia is modern, responsive, and performant.
   - **Backend**: Node.js + Express + TypeScript provides a lightweight, modular foundation.
   - *Enhancement*: Replace Bulma with a sleek, bespoke Tailwind/modern CSS design system that delivers a QuillBot-grade writing workspace.

### B. Components Requiring Complete Rebuild / Replacement
1. **Queue & Concurrency Management**:
   - *Discard*: `queue = [] as Generation[]`.
   - *Rebuild*: Robust in-memory or Redis-backed task queue with UUID generation, TTL eviction, error tracking, and cancelation.
2. **LLM Orchestration & Prompts**:
   - *Discard*: Minimal string templates in `prompt-types.ts` and single OpenAI call in `llm.ts`.
   - *Rebuild*: Multi-provider AI orchestrator supporting:
     - All 9 Paraphrasing Modes + Custom Prompting.
     - Synonym slider intensity mapping.
     - Dedicated Grammar Checker engine with structured JSON error reporting.
     - AI Humanizer with burstiness/naturalness tuning.
     - Summarizer with Paragraph & Bullet formats and length controls.
     - Translator covering 50+ languages with auto-detection.
     - Originality Suite (AI Detector heuristics, Plagiarism similarity engine, Citation generator).
     - AI Chat writing assistant.
3. **Security Infrastructure**:
   - *Add*: Helmet, CORS allowlisting, Zod schema validation, express-rate-limit, structured request logging without credentials.
4. **Editor Experience**:
   - *Rebuild*: Full dual-panel responsive editor with live word counters, real-time character statistics, copy/export buttons, and side-by-side comparison views.

---

## 3. Compliance & Licensing
- All reused algorithmic concepts retain attribution to the original author (Kristian Polso) under the MIT License terms.
- No QuillBot proprietary assets, logos, trademarks, or copyrighted text are copied.
