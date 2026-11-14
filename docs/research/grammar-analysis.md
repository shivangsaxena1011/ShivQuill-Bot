# QuillBot Grammar Checker: Behavioral & Functional Analysis

## 1. Functional Scope

The Grammar Checker performs automatic proofreading across four categories:
1. **Grammar Errors**: Subject-verb agreement, tense inconsistency, incorrect preposition use, dangling modifiers, incomplete sentence fragments.
2. **Spelling Mistakes**: Typos, phonetically similar words (their/there/they're, effect/affect), casing errors.
3. **Punctuation Anomalies**: Missing Oxford commas, misplaced semicolons, unclosed quotation marks, double spaces.
4. **Style & Fluency Suggestions**: Redundancies, passive voice over-reliance, run-on sentences.

---

## 2. User Interaction & Correction Workflow

- **Error Underlining**:
  - **Red Squiggle / Underline**: Critical spelling and grammar errors.
  - **Yellow / Blue Underline**: Stylistic improvements, punctuation, clarity enhancements.
- **Card-Based Popover / Sidebar**:
  - Hovering or clicking an underlined token opens a card detailing:
    - The flagged error.
    - Proposed replacement.
    - Brief linguistic explanation (e.g., "Change to past tense for grammatical consistency").
    - Action buttons: `Accept` (or click suggestion directly) and `Ignore / Dismiss`.
- **Global Actions**:
  - **"Fix All Errors"**: One-click batch acceptance of all recommended corrections.
  - **Error Counter**: Displays total issues found (e.g., "5 grammar, 2 spelling").

---

## 3. Difference from Pure Generative Rewriting

Unlike a standard LLM rewrite that may completely rearrange a paragraph, the Grammar Checker maintains strict token alignment:
- Unflagged text remains byte-for-byte identical.
- Corrections are localized strictly to the errant token spans.
- The user retains granular veto power over every single suggestion.
