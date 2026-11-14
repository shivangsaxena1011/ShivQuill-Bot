# ShivQuill v2.2 — Production-Grade AI Writing Platform (Release Candidate)

ShivQuill is an independently architected, production-grade AI writing platform designed to match the functional workflows of QuillBot with strict zero-mock enforcement, large document support (up to 1,000,000 characters / ~150,000 words), hardened cancellation orchestration, and transparent originality metrics.

---

## 🚀 Key Writing Tools & Capabilities

1. **Paraphraser (Large Document Orchestration)**:
   - **9 Distinct Writing Modes**: *Standard*, *Fluency*, *Formal*, *Academic*, *Simple*, *Creative*, *Expand*, *Shorten*, and *Custom* (with user-defined style prompts).
   - **4-Tier Synonym Intensity Slider**: Fine-grained vocabulary variance control.
   - **Interactive Token Diffing**: Highlights word modifications (synonyms, insertions, deletions) with click-to-cycle alternative suggestions.
   - **Rolling Context Window**: Passes preceding chunk context to ensure natural transition flow across paragraph boundaries.
   - **Invariance & Entity Tracking**: Transparently evaluates retention of citations, numbers, dates, URLs, and proper nouns.
   - **Hardened Chunk Orchestrator**: Supports documents up to 1,000,000 characters with abortable network requests, immediate `AbortSignal` propagation, abortable backoff sleep, and real-time cancellation without retaining or completing cancelled jobs.
   - **No Artificial Paywalls**: Zero free-plan word caps or subscription gate interruptions.

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
   - **Admin-Secured Corpus Ingestion**: `POST /api/originality/corpus` protected by constant-time `CORPUS_ADMIN_KEY` authentication (`crypto.timingSafeEqual`), SSRF loopback protections, and document size boundaries.
   - **Citation Generator**: Formats academic citations across APA (7th ed), MLA (9th ed), Chicago (17th ed), and Harvard. Includes automated DOI bibliographic lookup via Crossref REST API.

8. **AI Chat Assistant**:
   - Slide-over writing companion with sanitized, prompt-injection-safe document context awareness.

---

## 🛡️ Architecture & Zero-Mock Security Policy

- **ZERO-MOCK POLICY**: Production startup unconditionally rejects `MOCK` mode and missing credentials (`assertProductionReadiness`). `MOCK` is restricted strictly to isolated automated unit test suites.
- **Immediate Cancellation Propagation**: Network requests down to the OpenAI client pass active `AbortSignal` instances, immediately cutting off compute and API usage upon cancellation.
- **Corpus Protection**: Protected by timing-safe admin authorization and SSRF prevention filters.
- **Hardened Middleware**: Strict Content Security Policy (CSP), CORS allowlisting, and 300 req/min sliding-window rate limiting.
- **Decoupled Health Status**: Clear separation between platform service health (`healthy`) and AI engine status (`ready`, `unconfigured`, `mock_simulation`).

---

## 🧪 Testing & Verification

- **Automated Tests**: Over 50 unit, integration, cancellation, and security tests passing (`npm test`).
- **Benchmark Suite**: 200 synthetic writing samples evaluated across 9 categories (`npm run benchmark:mock`).
- **Independent Evaluation**: Deterministic entity invariance checks separated from qualitative semantic equivalence; simulated execution speed clearly distinguished from remote network inference.

---

## 🏃 Running the Application

```bash
# 1. Install dependencies
npm run install:all

# 2. Configure environment
cp .env.example .env
# Edit .env and supply your GROQ_API_KEY or OPENAI_API_KEY, and optional CORPUS_ADMIN_KEY

# 3. Run unit, cancellation, and security tests
npm test

# 4. Build and start production server
npm run build
npm start
```
The application will be live at `http://localhost:5000`.

## ☁️ Deploying to Render (free plan)

ShivQuill deploys as **one web service**: the backend also serves the built frontend.

1. Push this repo to GitHub.
2. In Render choose **New → Blueprint** and select the repo. `render.yaml` sets everything up.
   - Or create a **Web Service** by hand with:
     - Build command: `npm run render-build`
     - Start command: `npm start`
     - Health check path: `/api/health`
3. Set the secret **`GROQ_API_KEY`** in the service's Environment tab. Groq has a free API tier.

Notes for the free plan:
- **Sleeping:** the service sleeps after about 15 minutes idle. The UI shows "Waking up the server…" and retries automatically, and the first request can take 30–60 seconds.
- **Lost state:** jobs and the reference corpus live in memory, so a restart or sleep clears them.
- **No `CORS_ORIGIN` needed:** the site's own address is always allowed. Only set `CORS_ORIGIN` if another site calls the API.
- **Tuning:** use `AI_REQUESTS_PER_MINUTE` (default 30 per IP), `MAX_CHARS_PER_REQUEST` (default 12000) and `MAX_ACTIVE_JOBS` (default 50) to fit the 512 MB instance.
