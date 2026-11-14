# Remaining Technical Limitations & Future Horizons (v2.0)

## 1. Verified Real-World Boundaries

1. **Anti-Bot Challenge Gating**:
   - As directly confirmed by REA Evidence `ev_4e2ccf48e1c0f58c8c4842846fb3ff5b4df8220d2f771573a18ab57d594112f0`, live automated headless scraping of QuillBot's proprietary frontend is blocked by Cloudflare Turnstile.
   - Per AI agent safety rules, automated CAPTCHA solving is strictly avoided. Real-time parity verification relies on sanctioned public interfaces and controlled replay.

2. **Proprietary Model Weights**:
   - QuillBot's internal fine-tuned weights and proprietary vector databases are private commercial trade secrets.
   - ShivQuill achieves comparable results using foundation models (Llama-3.3-70B, GPT-4o-mini, Claude 3.5 Sonnet) combined with calibrated system prompt engineering.

3. **Plagiarism Corpus Scope**:
   - Commercial plagiarism checkers license billion-page web indexes (e.g. Turnitin).
   - ShivQuill provides an authentic local $k$-gram shingle and MinHash comparison engine over indexed open-access and local reference documents (arXiv, W3C, IPCC), correctly returning 0% when no match exists. Full web search indexing requires external commercial Search APIs (e.g., Bing Web Search API).

4. **Statistical AI Detection Uncertainty**:
   - Statistical surface analyzers (evaluating Shannon entropy, sentence-length CV, and Type-Token Ratio) measure syntactic regularity, NOT neural authorship.
   - False positives on academic papers, legal contracts, technical specifications, and non-native English writing remain an inherent characteristic of statistical heuristics. ShivQuill explicitly disclaims this and warns users against punitive decisions.

5. **Semantic Preservation vs. Entailment**:
   - While invariant entity tracking ensures that proper nouns, dates, citations, and numbers are retained verbatim, assessing deep semantic nuances (e.g. shifts in epistemic certainty from "might" to "will") requires qualitative human review or dedicated Natural Language Inference (NLI) cross-encoders.
