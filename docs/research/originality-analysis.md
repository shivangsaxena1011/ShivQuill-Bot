# Originality Suite Analysis: AI Detector, Plagiarism Checker & Citation Generator

## 1. AI Detector

### Observed / Documented Features
- Input threshold: Minimum 80 words.
- Output: Aggregate probability score (0% to 100% AI-generated).
- Segment-level highlighting: Sentences color-coded based on probability (High AI likelihood vs Likely Human vs Paraphrased).
- Statistical indicators evaluated: Perplexity (how unpredictable words are) and Burstiness (variance in sentence length and structure).

### Engineering Realism & Epistemic Limitations
- **Crucial Engineering Reality**: A simple LLM prompt asking "Is this written by an AI?" is notoriously unreliable and hallucinatory.
- **True Implementation**: Requires token log-probability analysis, n-gram entropy, or fine-tuned RoBERTa/DeBERTa classifiers trained on curated human vs synthetic datasets.
- **Uncertainty Presentation**: An honest, ethical AI detector MUST display confidence intervals and disclaimers stating that AI detection cannot provide 100% legal or academic certainty and has known false positive risks on ESL/non-native writers.

---

## 2. Plagiarism Checker

### Observed / Documented Features
- Scans user document against indexed web corpora, academic repositories, and pre-print archives.
- Highlights identical and paraphrased text segments.
- Generates overall similarity index (%) and provides direct clickable links to matching sources.
- Available only on Premium tiers (e.g., 25,000 words per month) due to expensive web crawling and licensed search index costs (e.g., Turnitin, Copyscape, Bing Web Search API, Google Search API).

### Engineering Architecture Requirements
- Cannot be fabricated with an LLM prompt.
- Architecture requires:
  1. Shingling & MinHash / SimHash for document fingerprinting.
  2. External search engine indexing (Bing/Google Search API or academic API like OpenAlex/Crossref) to fetch candidate matching documents.
  3. Longest Common Subsequence (LCS) or vector cosine similarity to calculate segment-by-segment match percentage.

---

## 3. Citation Generator

### Observed / Documented Features
- Formats bibliographies and in-text citations across 1,000+ citation formats:
  - APA (7th edition)
  - MLA (9th edition)
  - Chicago (17th edition)
  - Harvard
- Source types supported: Website, Journal Article, Book, Video, Report.
- Input modalities:
  - Automated lookup via URL, DOI, or ISBN.
  - Manual form input for title, authors, publication date, publisher.
- Export options: Copy formatted citation, copy in-text citation, download `.bib` or `.rtf`.
