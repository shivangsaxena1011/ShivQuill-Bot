# ShivQuill — Enterprise AI Writing & Paraphrasing Platform

ShivQuill is a production-grade, independently architected AI writing platform built to match the comprehensive feature set of QuillBot. It provides a full suite of writing enhancement tools, intelligent token-level text diffing, multi-provider AI orchestration, and hardened backend security.

---

## 🚀 Key Writing Tools & Capabilities

1. **Paraphraser**:
   - 9 Distinct Writing Modes: *Standard*, *Fluency*, *Formal*, *Academic*, *Simple*, *Creative*, *Expand*, *Shorten*, and *Custom*.
   - 4-Tier Synonym Intensity Slider adjusting vocabulary variance.
   - Interactive Token Diffing: highlights changed words (synonyms, insertions, deletions) with click-to-replace alternative suggestions.
   - Strict factual invariance: guarantees preservation of proper names, citations, numbers, dates, and measurements.
2. **Grammar & Spell Checker**:
   - Deep structural proofreading across grammar, spelling, punctuation, and style.
   - Error cards with linguistic explanations and individual or one-click batch acceptance ("Fix All").
3. **AI Humanizer**:
   - Analyzes and optimizes *burstiness* (sentence length variation) and conversational rhythm.
   - Prunes overused LLM cliches (e.g., "furthermore", "tapestry", "crucial") into organic, authentic prose.
4. **Summarizer**:
   - Dual Output Formats: Structured Markdown Bullet Points or Cohesive Prose Paragraphs.
   - 3-Tier Summary Length Slider: Short (1-2 sentences), Medium (balanced), and Long (comprehensive abstract).
   - Real-time reduction ratio statistics.
5. **Translator**:
   - 50+ languages with automatic source language detection and one-click bidirectional language swapping.
6. **Originality Suite**:
   - **AI Detector**: Evaluates perplexity and burstiness to compute 0–100% AI likelihood with per-sentence heatmap.
   - **Plagiarism Checker**: N-gram shingling similarity scanner identifying matching passages and source URLs.
   - **Citation Generator**: Formats in-text citations and full bibliographies across APA, MLA, Chicago, and Harvard.
7. **AI Chat Assistant**:
   - Integrated slide-over writing companion with real-time document context awareness.

---

## 🛡️ Architecture & Security Highlights

- **Backend**: Node.js, Express, TypeScript, Helmet, CORS allowlisting, and sliding-window rate limiting.
- **Defensive Engineering**: Solved Phrasing-Bot's zero-chunk infinite loop vulnerability (`Math.max(1, chunkSize)`).
- **Task Management**: Auto-expiring 15-minute TTL task queue preventing memory leaks.
- **Frontend**: Vue 3 (Composition API), TypeScript, Vite, Pinia, and custom responsive CSS.
- **AI Orchestration**: Multi-provider support (Groq Llama-3.3-70B, OpenAI GPT-4o-mini, OpenRouter, Custom vLLM/Ollama, and offline Mock engine).

---

## 🧪 Testing & Verification

- **Automated Tests**: 18 unit and integration tests passing with 100% success (`npm test`).
- **Benchmark Suite**: 200 synthetic writing samples evaluated across 9 dimensions with a 100% factual invariance pass rate (`npm run benchmark`).

---

## 📖 Research & Audit Documentation

Comprehensive technical analysis reports are preserved in `docs/`:
- [`docs/research/evidence-and-limitations.md`](docs/research/evidence-and-limitations.md): REA verification, Cloudflare Turnstile challenge observation (`ev_4e2ccf48e1c0f58c8c4842846fb3ff5b4df8220d2f771573a18ab57d594112f0`), and ethical boundaries.
- [`docs/research/quillbot-inventory.md`](docs/research/quillbot-inventory.md): Full product breakdown, free vs. premium tiers, and word limits.
- [`docs/research/paraphraser-analysis.md`](docs/research/paraphraser-analysis.md): Mode specifications, slider behaviors, and invariant tokens.
- [`docs/research/phrasing-bot-code-audit.md`](docs/research/phrasing-bot-code-audit.md): Deep architectural code audit of Krisseck/Phrasing-Bot.
- [`docs/research/phrasing-bot-security-audit.md`](docs/research/phrasing-bot-security-audit.md): Complete vulnerability analysis and remediation guide.
- [`docs/research/reuse-vs-rebuild.md`](docs/research/reuse-vs-rebuild.md): Architectural decision record on what was preserved vs rebuilt.
- [`docs/architecture.md`](docs/architecture.md): Full system topology and data flow diagrams.
- [`docs/feature-parity-assessment.md`](docs/feature-parity-assessment.md): Feature-by-feature parity comparison against QuillBot.
- [`docs/security.md`](docs/security.md): Threat model and production hardening proofs.
- [`docs/deployment.md`](docs/deployment.md): Detailed installation and containerization instructions.

---

## 🏃 Running the Application

```bash
# 1. Install dependencies
npm run install:all

# 2. Run unit and integration tests
npm test

# 3. Run 200-sample benchmark
npm run benchmark

# 4. Build and start production server
npm run build
npm start
```
The server will be live on `http://localhost:5000`.
