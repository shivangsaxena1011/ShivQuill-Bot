# ShivQuill v2.1 — Production-Grade AI Writing Platform (Zero-Mock Enforced)

ShivQuill is an independently architected, production-grade AI writing platform designed to match the functional workflows of QuillBot with strict zero-mock enforcement, no artificial user-facing word caps, and transparent originality metrics.

---

## 🚀 Key Writing Tools & Capabilities

1. **Paraphraser (Unconstrained Document Processing)**:
   - **9 Distinct Writing Modes**: *Standard*, *Fluency*, *Formal*, *Academic*, *Simple*, *Creative*, *Expand*, *Shorten*, and *Custom* (with user-defined style prompts).
   - **4-Tier Synonym Intensity Slider**: Fine-grained vocabulary variance control.
   - **Interactive Token Diffing**: Highlights word modifications (synonyms, insertions, deletions) with click-to-cycle alternative suggestions.
   - **Rolling Context Window**: Passes preceding chunk context to ensure natural transition flow across paragraph boundaries.
   - **Invariance & Entity Tracking**: Transparently evaluates retention of citations, numbers, dates, URLs, and proper nouns.
   - **Chunk Orchestrator**: Supports large documents with transient chunk retries, partial recovery, and cancellation without losing completed work.
   - **Zero User-Facing Limits**: No artificial free-plan caps, subscription gates, or "limit reached" interruptions.

2. **Grammar & Spell Checker**:
   - Strict structured-output validation across grammar, spelling, punctuation, and style.
   - Recalibrated character offsets for exact in-text highlighting.
   - Individual issue replacement and batch "Fix All" correction.

3. **Advanced Writing Suggestions**:
   - Actionable diagnostics linked to exact character spans in the text.
   - Five targeted dimensions: **Clarity**, **Conciseness**, **Vocabulary & Repetition**, **Tone & Register**, and **Sentence Restructuring**.
   - One-click "Apply" button to replace suggestions in-place.

4. **AI Humanizer**:
   - Rebalances sentence cadence and *burstiness* (sentence length variation).
   - Prunes synthetic LLM clichés (*furthermore*, *tapestry*, *beacon*, *crucial*) into organic, authentic human prose.
   - Transparent readability assessment using standard Flesch Reading Ease score and sentence length variance.

5. **Summarizer**:
   - **Dual Output Formats**: Structured Markdown Bullet Points or Cohesive Prose Paragraphs.
   - **3-Tier Summary Length**: Short (~15-20%), Medium (~30-40%), and Long (~50-60%).
   - Dynamic word reduction ratio calculation.

6. **Translator**:
   - High-fidelity multilingual translation across 50+ languages (Spanish, French, German, Chinese, Hindi, Japanese, Arabic, etc.).
   - Automatic script-based source language detection and one-click bidirectional language swap.

7. **Originality Suite**:
   - **AI Detector (Experimental Linguistic Analyzer)**: Evaluates lexical surface regularity via Shannon entropy ($H$), sentence length coefficient of variation ($CV$), and Type-Token Ratio ($TTR$). Includes explicit false-positive risk warnings for academic and technical text.
   - **Plagiarism Scanner**: Modular $k$-gram shingling, 64-hash MinHash Jaccard estimation, and inverted indexing against verified open-access reference literature (arXiv, W3C, IPCC) with zero synthetic example domains.
   - **Citation Generator**: Formats academic citations across APA (7th ed), MLA (9th ed), Chicago (17th ed), and Harvard. Includes automated DOI bibliographic lookup via Crossref REST API.

8. **AI Chat Assistant**:
   - Slide-over writing companion with sanitized, prompt-injection-safe document context awareness.

---

## 🛡️ Architecture & Zero-Mock Security Policy

- **ZERO-MOCK POLICY**: Production startup unconditionally rejects `MOCK` mode and missing credentials (`assertProductionReadiness`). `MOCK` is restricted strictly to isolated automated unit test suites.
- **Chunk Orchestration**: Implements `DocumentProcessingJob` with transient retries (2 attempts with exponential backoff), partial recovery, and cancellation via `/api/tasks/:id/cancel`.
- **Defensive Engineering**: Solved Phrasing-Bot's zero-chunk infinite loop vulnerability (`Math.max(1, chunkSize)`).
- **Task Management**: Auto-expiring 15-minute TTL task queue preventing memory leaks.
- **Hardened Middleware**: Helmet security headers, CORS origin allowlisting, and 300 req/min sliding-window rate limiting.

---

## 🧪 Testing & Verification

- **Automated Tests**: 30 unit and integration tests passing (`npm test`).
- **Benchmark Suite**: 200 synthetic writing samples evaluated across 9 categories (`npm run benchmark:mock`).
- **Independent Evaluation**: Deterministic entity invariance checks separated from qualitative semantic equivalence; simulated execution speed clearly distinguished from remote network inference.

---

## 🏃 Running the Application

```bash
# 1. Install dependencies
npm run install:all

# 2. Configure environment
cp .env.example .env
# Edit .env and supply your GROQ_API_KEY or OPENAI_API_KEY

# 3. Run unit and integration tests
npm test

# 4. Build and start production server
npm run build
npm start
```
The application will be live at `http://localhost:5000`.
