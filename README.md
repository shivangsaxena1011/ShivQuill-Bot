<div align="center">

  <img src="frontend/public/logo.png" alt="ShivQuill Bot Banner" width="580" style="border-radius: 12px; margin-bottom: 16px;" />

  # ShivQuill — AI Writing & Originality Platform

  **An enterprise-grade, independent AI writing intelligence suite engineered for high-throughput prose transformation, structural grammar diagnostics, and verified originality metrics.**

  [![Live Platform](https://img.shields.io/badge/Live%20Platform-Online-00C853?style=for-the-badge&logo=render&logoColor=white)](https://shivquill.onrender.com)
  [![Version](https://img.shields.io/badge/Version-2.3.0-4F46E5?style=for-the-badge)](https://github.com/shivangsaxena1011/ShivQuill-Bot/releases)
  [![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
  [![Zero--Mock Policy](https://img.shields.io/badge/Zero--Mock-Enforced-emerald?style=for-the-badge)](#zero-mock-architecture-policy)

  [**Explore Live Application ↗**](https://shivquill.onrender.com) • [**API Health Status ↗**](https://shivquill.onrender.com/api/health) • [**System Architecture**](#system-architecture)

</div>

---

## 📖 Executive Summary

**ShivQuill** is a modern, modular AI writing platform designed to deliver professional-grade paraphrasing, style diagnostics, summarization, translation, and academic integrity tooling. Built on an independent architecture, ShivQuill combines multi-provider LLM orchestration with client-side edge computing, eliminating artificial paywalls, arbitrary word caps, and opaque heuristics.

Operating on a strict **Zero-Mock Policy**, every writing tool integrates with real LLM inference backends (Groq Llama 3.3, OpenAI GPT-4o, OpenRouter) or transparently reports readiness states—never presenting synthetic mock responses as live AI completions.

---

## 🚀 Platform Capabilities & Suite Overview

### 1. Paraphraser & Multi-Mode Rewriter
* **9 Calibrated Rewrite Modes**:
  * *Standard*: Balanced vocabulary variation maintaining natural readability.
  * *Fluency*: Optimizes grammatical syntax, punctuation, and rhythm.
  * *Formal*: Elevates tone for corporate, legal, and executive communication.
  * *Academic*: Sophisticated domain vocabulary and rigorous syntactical phrasing.
  * *Simple*: Clarifies sentence construction for maximum accessibility and comprehension.
  * *Creative*: Broad imaginative vocabulary and varied figurative expressions.
  * *Expand*: Enriches concise statements with contextual depth.
  * *Shorten*: Trims fluff, tautology, and wordiness while preserving core meaning.
  * *Custom*: User-defined stylistic instructions and reusable custom presets.
* **4-Tier Synonym Intensity Control**: Granular slider regulating lexical change frequency.
* **Comparative Multi-Mode Evaluation**: Side-by-side simultaneous generation comparing up to 3 distinct paraphrase modes.
* **Frozen Term Protection**: Dedicated "Keep Unchanged" list guaranteeing that mission-critical terminology, trade names, and technical keywords remain untouched.
* **Selective Sentence Rephrasing**: Interactive generation of 3 distinct rewrite candidates for any selected phrase.
* **Token-Level Diff Engine**: Color-coded visualization distinguishing synonyms, structural restructurings, insertions, and deletions with click-to-swap alternatives.

### 2. Grammar, Spell & Style Checker
* **Deep Syntactical Analysis**: Structural evaluation identifying subject-verb disagreements, punctuation errors, homophone confusion, and non-standard phrasing.
* **Dynamic Character Offset Tracking**: Real-time recalibration of in-text coordinates ensuring error highlights remain aligned after edits.
* **One-Click Batch Correction**: Granular per-issue suggestion acceptance or comprehensive *"Fix All"* resolution.

### 3. Tone Analyzer & 8-Voice Rewriter
* **Real-Time Tone Classification**: Evaluates dominant register across 8 distinct dimensions (*Casual*, *Formal*, *Confident*, *Friendly*, *Academic*, *Direct*, *Persuasive*, *Empathetic*).
* **Controlled Tone Rewriting**: Seamlessly shifts document tone while preserving core factual assertions.

### 4. AI Humanizer & Prose Naturalizer
* **Burstiness & Cadence Rebalancing**: Varies sentence length distributions to break rigid, uniform syntactical patterns typical of AI generators.
* **Cliché & Marker Stripping**: Eliminates repetitive synthetic fillers (*furthermore*, *tapestry*, *delve*, *beacon*, *crucial*).
* **Readability Diagnostics**: Standardized Flesch Reading Ease calculations and flow scores.

### 5. Multi-Format Summarizer
* **Dual Presentation Modes**: Cohesive prose synthesis or structured Markdown bullet points.
* **Dynamic Reduction Tuning**: 3 length presets (Short ~20%, Medium ~40%, Long ~60%) with real-time compression ratio tracking.
* **Map-Reduce Large Document Summarization**: Recursive chunk summarization capable of synthesizing lengthy manuscripts without context exhaustion.

### 6. Multilingual Translation
* **50+ Languages Supported**: High-accuracy cross-lingual translation with automatic script-based source detection.
* **Domain Translation Glossary**: Custom key-value terminology mapping for consistent brand and technical nomenclature.

### 7. Originality & Integrity Suite
* **AI Surface Regularity Detector**: Transparent, non-neural linguistic evaluation utilizing Shannon lexical entropy ($H$), sentence-length coefficient of variation ($CV$), and Type-Token Ratio ($TTR$). Includes explicit false-positive disclosures for non-native and technical writing.
* **Plagiarism Similarity Scanner**: Inverted index engine utilizing 5-gram shingling and 64-hash MinHash Jaccard estimation against a curated open-access corpus (arXiv research, W3C specifications, IPCC reports).
* **Administrative Corpus Management**: Protected ingestion API secured with constant-time token comparison (`crypto.timingSafeEqual`) and SSRF filtering.
* **Academic Citation Engine**: Instant bibliography and in-text citation generation across APA (7th), MLA (9th), Chicago (17th), and Harvard formats, powered by live Crossref DOI metadata resolution and OpenLibrary ISBN lookup.

### 8. Client-Side Edge Tools (Zero Server Latency)
* **Readability Dashboard**: Automated grade level scoring, passive voice detection, reading/speaking time estimates, and word repetition heatmaps.
* **Local Document Library**: Client-side IndexedDB storage providing persistent history, document drafts, and multi-step undo/redo.
* **Document Import/Export**: Direct parsing of `.docx`, `.md`, and `.txt` files; instant export to `.docx`, PDF (print), `.md`, and `.txt`.
* **Progressive Web App (PWA)**: Full offline service worker caching and keyboard shortcut navigation (`?`).

---

## 🏛️ System Architecture

```
+---------------------------------------------------------------------------------------+
|                                    Client Layer (Vue 3)                               |
|   - Modular Component Architecture & Design Token CSS System (Dark / Light Theme)     |
|   - Real-Time Server-Sent Events (SSE) Streaming Consumer                             |
|   - Offline-First Storage Engine (IndexedDB Document Library)                         |
|   - Client-Side File Transpiler (.docx / .md / .txt / PDF)                            |
+---------------------------------------------------------------------------------------+
                                           |
                                 HTTPS / REST / SSE
                                           |
+---------------------------------------------------------------------------------------+
|                                 Application Gateway                                   |
|   - Node.js + Express + TypeScript Runtime                                            |
|   - Helmet Hardened Headers & Granular Content Security Policy (CSP)                  |
|   - Sliding-Window Rate Limiting (Per-IP AI Quota Enforcement)                        |
|   - Constant-Time Cryptographic Admin Authorization (crypto.timingSafeEqual)          |
+---------------------------------------------------------------------------------------+
                                           |
            +------------------------------+------------------------------+
            |                                                             |
+-----------------------+                                     +-----------------------+
|  Chunk Orchestrator   |                                     |   Originality Core    |
| - Paragraph Slicing   |                                     | - 5-Gram Shingling    |
| - Rolling Context     |                                     | - 64-Hash MinHash     |
| - AbortSignal Binding |                                     | - Crossref DOI API    |
| - Exponential Backoff |                                     | - Inverted Postings   |
+-----------------------+                                     +-----------------------+
            |
+---------------------------------------------------------------------------------------+
|                               Upstream AI Provider Hub                                |
|   - Groq API (Llama 3.3 70B Versatile)                                                |
|   - OpenAI API (GPT-4o, GPT-4o-mini)                                                  |
|   - OpenRouter API & Self-Hosted Custom Endpoints                                     |
+---------------------------------------------------------------------------------------+
```

---

## 🛡️ Zero-Mock Architecture Policy

ShivQuill strictly enforces a **Zero-Mock Policy** across all production tiers:

1. **No Silent Mocking**: In production, missing credentials or upstream outages throw explicit, descriptive HTTP errors. The platform never returns pre-recorded or synthetic text under the guise of live AI.
2. **Immediate Abort Propagation**: When a user cancels a request or disconnects their client, an active `AbortSignal` immediately cancels the underlying in-flight HTTP request to the LLM provider, preventing wasted compute and quota.
3. **Decoupled Service Health**: Platform uptime (`status: 'healthy'`) is decoupled from AI provider readiness (`providerStatus: 'ready' | 'unconfigured'`), giving operators immediate visibility into third-party provider status.
4. **Isolated Test Harness**: Simulated mock processing is architecturally restricted to automated test runners (`REQUEST_TYPE=MOCK`).

---

## 📊 Empirical Verification & Benchmarks

ShivQuill's orchestration and linguistic engines are continuously evaluated against a 200-sample test suite spanning 9 categories (*Academic*, *Casual*, *Email*, *Technical*, *Research*, *Grammar Errors*, *Long Paragraphs*, *Multi-Paragraph*, and *Citations & Dates*).

| Evaluation Metric | Observed Performance | Evaluation Method |
|---|---|---|
| **Invariant Entity Retention** | **100.00%** (695 / 695 verified) | Strict string preservation of numbers, dates, citations, and proper nouns |
| **Document Boundary Integrity** | **100.00%** | Multi-sentence paragraph recombination and indentation preservation |
| **Vocabulary Diversity** | High | Myers token-level differential span classification |
| **Automated Test Coverage** | **129 / 129 Passing** | 117 Backend tests + 12 Frontend unit tests |
| **Document Length Bound** | Up to **1,000,000 chars** (~150K words) | Validated across 10K, 50K, and 100K stress tests |

---

## 🔒 Security & Privacy Engineering

* **Content Security Policy (CSP)**: Strict Helmet directives permitting only trusted local and production origins, Google Fonts, and Crossref APIs.
* **Corpus Anti-Poisoning**: Inverted index mutations are gated behind `CORPUS_ADMIN_KEY` authentication, duplicate title detection, and a 50,000-character payload ceiling.
* **SSRF Mitigation**: Document URL ingestion rejects private subnets (`10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`), loopbacks (`127.0.0.1`, `localhost`), and non-HTTP protocols.
* **Sanitized Prompt Boundaries**: System prompts and user inputs are strictly isolated within structural message roles to mitigate prompt injection risks.
* **Client-Side Privacy**: Library documents, custom presets, and file conversions remain in local IndexedDB storage and are never persisted to a remote database without explicit user action.

---

## 👤 Author & Maintainer

ShivQuill is independently designed, architected, and maintained by:

### **Shivang Saxena**
* **GitHub**: [@shivangsaxena1011](https://github.com/shivangsaxena1011)
* **Repository**: [ShivQuill-Bot](https://github.com/shivangsaxena1011/ShivQuill-Bot)
* **Live Deployment**: [https://shivquill.onrender.com](https://shivquill.onrender.com)

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for complete details.
