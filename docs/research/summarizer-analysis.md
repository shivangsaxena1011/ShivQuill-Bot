# QuillBot Summarizer: Behavioral & Specification Analysis

## 1. Functional Controls

The Summarizer accepts unstructured long-form text and condenses it according to two primary user settings:

### Format Modes
1. **Paragraph Mode**:
   - Generates a cohesive prose summary that flows logically from topic sentence to supporting details and conclusions.
2. **Key Sentences / Bullet Points Mode**:
   - Extracts or synthesizes distinct standalone bullets highlighting core takeaways, figures, or milestones.

### Summary Length Slider
- Configurable range from **Short** (concise 1–2 sentences / 2–3 bullets) to **Long** (comprehensive abstract preserving secondary context).

---

## 2. Processing Mechanisms

1. **Information Extraction**:
   - Identifies thesis statements, key quantitative metrics, and topical summaries.
2. **Abstractive vs Extractive**:
   - Modern implementations use hybrid extractive-abstractive summarization: key entities and numerical data are strictly preserved while prose is synthesized cleanly.
3. **Word Limits**:
   - Free users: 1,200 words.
   - Premium users: Up to 6,000 words.
