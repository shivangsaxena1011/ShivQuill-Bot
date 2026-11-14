# Feature & Behavioral Comparison Matrix

| Feature Dimension | QuillBot (Observed / Documented) | Phrasing-Bot (Krisseck Reference) | Our Target Platform (ShivQuill / Phrasing AI) |
| :--- | :--- | :--- | :--- |
| **Paraphraser Modes** | 9 Pre-set modes + Custom Mode | Only 1 mode (`GRAMMAR_PHRASING` with 3 styles) | Full 9 modes (Standard, Fluency, Formal, Academic, Simple, Creative, Expand, Shorten, Custom) |
| **Synonym Slider** | 4 discrete intensity levels | Not implemented | 4 levels controlling vocabulary temperature & replacement ratio |
| **Grammar Correction** | Dedicated module with inline popover, explanations, and batch accept | Static full-paragraph rewrite | Dedicated Grammar Checker with error classification, explanations, and selective accept/reject |
| **AI Humanizer** | Dedicated tool focusing on burstiness & natural rhythm | Not implemented | Dedicated Humanizer engine targeting robotic syntax and cliches |
| **Summarizer** | Paragraph & bullet points with length slider | Basic full-text prompt without format controls | Paragraph and Bullet-point modes with Short/Medium/Long length slider |
| **Translator** | 50+ languages with auto-detection | Not implemented | Multi-language translation with auto-detection and language swap |
| **Originality Tools** | AI Detector, Plagiarism, Citations | Not implemented | Full suite: Heuristic AI Detector, Source Similarity Checker, Citation Formatter (APA, MLA, etc.) |
| **AI Chat Workspace** | Interactive side-panel assistant | Not implemented | Integrated AI Chat Assistant with document context awareness |
| **Text Diff Engine** | Interactive changed-word highlighting with synonym alternative dropdown | Simple word-level diff viewer using Bulma colors | High-fidelity interactive diff with token classification & side-by-side comparison |
| **Sentence Chunking** | Intelligent chunking with context preservation | Basic `Intl.Segmenter` with infinite loop bug on 0 | Robust boundary-aware segmentation with safe default chunk sizes |
| **Backend Architecture** | Proprietary microservices | Monolithic Express server with in-memory unbounded array | Modular TypeScript Express REST API with provider abstraction, rate limiting, and input validation |
| **Security & Hardening** | Enterprise Cloudflare + WAF | Open CORS, no rate limit, no validation, keys in env | Helmet, CORS, express-rate-limit, Zod schema validation, safe error boundaries |
