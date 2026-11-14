# QuillBot Paraphraser Engine: Detailed Behavioral Analysis

## 1. Writing Modes Specification

QuillBot features 9 standardized modes plus a configurable Custom mode. Each mode alters vocabulary replacement thresholds, syntax inversion, syntactic clause chaining, and semantic tone.

| Mode Name | Tone & Intent | Vocabulary Replacement Level | Sentence Structure Alteration | Tier Availability |
| :--- | :--- | :--- | :--- | :--- |
| **Standard** | Default balance. Improves clarity while maintaining core terminology. | Medium (Balanced) | Minor to moderate clause rearrangement | Free (Public) |
| **Fluency** | Polishes grammatical flow and natural readability. Minimal drastic rewording. | Low (Conservative) | Minimal; preserves original cadence | Free (Public) |
| **Formal** | Sophisticated, professional business tone. Replaces colloquialisms with formal prose. | High (Professional lexicon) | Reconstructs compound sentences into formal phrasing | Premium |
| **Academic** | Scholarly, research-oriented discourse. Uses formal academic transitions. | High (Scholarly terminology) | Objective, passive/active academic balance | Premium |
| **Simple** | Maximizes readability (plain English). Targets lower Flesch-Kincaid grade level. | Moderate (Common vocabulary) | Breaks long compound sentences into short, direct sentences | Premium |
| **Creative** | Imaginative, expressive phrasing with metaphor and stylistic variety. | High (Vivid descriptors) | Significant syntactic inversion and restructuring | Premium |
| **Expand** | Elaborates on concepts, adds explanatory clauses to increase length. | Moderate | Inserts context, adverbial phrases, and clarifications | Premium |
| **Shorten** | Condenses text, removes filler words, preserves core thesis. | Moderate (Concise phrasing) | Prunes redundant clauses, combines parallel phrases | Premium |
| **Custom** | Guided by user-supplied stylistic instructions (e.g., "persuasive pitch", "humorous"). | Variable based on prompt | Adapts structure directly to instruction | Premium |

---

## 2. Vocabulary / Synonym Slider Behavior

The Synonym Slider is a continuous or stepped parameter (Levels 1 to 4) that controls the replacement probability and semantic distance:
- **Level 1 (Fewer Changes)**: Only corrects awkward phrasings; retains >90% original words. Highest factual preservation.
- **Level 2 (Balanced - Default)**: Substitutes common verbs and adjectives with high-probability synonyms.
- **Level 3 (More Changes)**: Actively rewrites clauses and introduces varied synonyms.
- **Level 4 (Maximum Changes)**: Aggressive transformation. Inverts sentence grammar and replaces phrases with diverse vocabulary. (Risk: slightly higher semantic drift if context is ambiguous).

---

## 3. UI/UX & Output Comparison Controls

1. **Changed-Word Highlighting**:
   - The output pane displays color-coded text highlighting:
     - **Orange/Yellow**: Words replaced with synonyms.
     - **Blue**: Words restructured or moved in sentence order.
     - **Unchanged / Black**: Original words preserved.
2. **Interactive Synonym Dropdown**:
   - Clicking any changed word displays an inline popover with alternative synonyms ranked by semantic fit, allowing instant in-place substitution.
3. **Editor Actions**:
   - **Rephrase Entire Sentence**: Individual sentence focus toolbar.
   - **Copy to Clipboard**: Quick copy button with visual checkmark feedback.
   - **Export / Download**: Clean `.txt` or `.docx` export.
   - **Undo / Redo**: Multi-step history stack.
   - **Word & Character Count**: Real-time counters on both input and output panels.

---

## 4. Preservation & Invariance Requirements

In a production-grade AI paraphraser, the following tokens must remain invariant:
- **Proper Nouns & Named Entities**: Brand names, personal names, geographic locations.
- **Numbers, Dates & Measurements**: E.g., "$15.4 million", "November 14, 2026", "98.6°F".
- **Citations & References**: E.g., "(Smith et al., 2021)", "[14]".
- **Direct Quotations**: Text inside quotation marks should remain intact unless explicitly instructed.
- **Domain-Specific Technical Terminology**: Medical, legal, and software terms (e.g., "myocardial infarction", "amortization", "WebSocket").
