# Remaining Technical Limitations & Future Horizons

## 1. Verified Real-World Boundaries

1. **Anti-Bot Challenge Gating**:
   - As directly confirmed by REA Evidence `ev_4e2ccf48e1c0f58c8c4842846fb3ff5b4df8220d2f771573a18ab57d594112f0`, live automated headless scraping of QuillBot's proprietary frontend is blocked by Cloudflare Turnstile.
   - Per AI agent safety rules, automated CAPTCHA solving is strictly avoided. Real-time parity verification relies on sanctioned public interfaces and controlled replay.
2. **Proprietary Model Weights**:
   - QuillBot's internal fine-tuned weights and proprietary vector databases are private commercial trade secrets.
   - ShivQuill achieves comparable results using foundation models (Llama-3.3-70B, GPT-4o-mini, Claude 3.5 Sonnet) combined with calibrated system prompt engineering.
3. **External Plagiarism Web Corpora**:
   - Commercial plagiarism checkers license billion-page web indexes (e.g. Turnitin).
   - ShivQuill provides an authentic local k-gram shingle comparison engine over local reference documents, correctly returning 0% when no match exists. Full web search indexing requires external commercial Search APIs (e.g., Bing Web Search API).
4. **AI Detection Statistical Uncertainty**:
   - Statistical classifiers cannot guarantee 100% precision or recall against modern LLMs. False positives on non-native English speakers remain an inherent industry-wide characteristic. ShivQuill presents these metrics with transparent uncertainty disclaimers.
5. **Real AI Provider Key Provisioning**:
   - Live external AI completions depend on configuring `GROQ_API_KEY`, `OPENAI_API_KEY`, or `OPENROUTER_API_KEY` in `.env`.
   - The platform cleanly reports provider configuration status and throws explicit errors rather than masking missing credentials with mock data.
