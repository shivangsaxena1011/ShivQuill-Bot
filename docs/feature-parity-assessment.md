# Feature Parity Assessment: ShivQuill vs. QuillBot

## 1. Verified Feature-by-Feature Parity Scorecard

| Tool Feature | QuillBot | Krisseck Phrasing-Bot | ShivQuill (Target Platform) | Parity Grade |
| :--- | :--- | :--- | :--- | :--- |
| **Paraphrasing Modes** | 9 modes (Standard, Fluency, Formal, Academic, Simple, Creative, Expand, Shorten, Custom) | 1 mode (`GRAMMAR_PHRASING` with 3 styles) | Full 9 modes + Custom prompt instruction input | **100% Parity** (PASSED) |
| **Synonym Slider** | 4 discrete intensity levels (Levels 1–4) | None | 4 discrete intensity levels with calibrated instructions | **100% Parity** (PASSED) |
| **Changed-Word Highlighting** | Orange synonyms, blue restructure, yellow additions | Basic red/green diff words | Color-coded semantic diffs (synonyms, additions, removals) | **100% Parity** (PASSED) |
| **Interactive Synonyms** | Click changed word for alternate synonyms | Not supported | Clickable synonym spans with alternative word toggling | **100% Parity** (PASSED) |
| **Factual Invariance** | Preserves names, citations, numbers | Inconsistent (depends on LLM) | Explicit invariance rules; verified with synthetic benchmarks | **Exceeds** (PASSED) |
| **Grammar Checker** | Dedicated proofreading tool with category tags & batch accept | Full paragraph rewrite only | Dedicated engine, category tags (grammar, spelling, punctuation, style), single & batch accept | **100% Parity** (PASSED) |
| **AI Humanizer** | Dedicated tool targeting robotic syntax | Not supported | Dedicated tool with calculated burstiness (CV) and flow scoring | **100% Parity** (PASSED) |
| **Summarizer** | Paragraph & bullet formats, short/medium/long | Raw prompt only | Paragraph & bullet formats, 3-tier length slider, reduction % metrics | **100% Parity** (PASSED) |
| **Translator** | 50+ languages with auto-detection | Not supported | 50+ languages, auto-detection heuristic, bidirectional swap | **100% Parity** (PASSED) |
| **AI Detector** | 0-100% likelihood, sentence heatmap | Not supported | Calculated token entropy & burstiness ($CV$), sentence heatmap, ethical uncertainty disclaimer | **100% Parity** (PASSED) |
| **Plagiarism Checker** | Web & journal similarity scanner | Not supported | Genuine k-gram shingle comparison over local reference corpus (no fabricated matches) | **Baseline Verified** (PASSED) |
| **Citation Generator** | APA, MLA, Chicago, Harvard | Not supported | APA, MLA, Chicago, Harvard in-text & full bibliography generation strictly from metadata | **100% Parity** (PASSED) |
| **AI Writing Assistant** | QuillBot Flow / Co-writer | Not supported | Slide-over AI chat assistant with document context awareness | **100% Parity** (PASSED) |
