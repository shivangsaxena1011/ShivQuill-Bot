# Originality Suite Architecture & Accuracy Analysis (v2.2)

## 1. AI Detection: Statistical Linguistic Surface Regularity Analyzer

### 1.1 Methodology & Mathematical Foundations
ShivQuill's AI detector does **not** rely on naive LLM self-evaluation prompts. Instead, it computes three objective statistical surface metrics across the input document:

1. **Shannon Lexical Entropy ($H$)**:
   Measures lexical information density and word distribution predictability:
   $$H(X) = -\sum_{i=1}^{n} P(x_i) \log_2 P(x_i)$$
   where $P(x_i) = \frac{\text{count}(x_i)}{\text{total words}}$. Lower entropy values indicate repetitive vocabulary distributions characteristic of default LLM completions.

2. **Burstiness / Sentence-Length Coefficient of Variation ($CV$)**:
   Human writing displays high stylistic variance in sentence cadence (alternating between short punchy sentences and compound clauses). In contrast, LLM prose exhibits uniform sentence lengths:
   $$CV = \frac{\sigma}{\mu} = \frac{\sqrt{\frac{1}{N}\sum_{i=1}^{N}(L_i - \bar{L})^2}}{\bar{L}}$$
   where $L_i$ is the word count of sentence $i$. A $CV < 0.25$ indicates high structural uniformity; $CV > 0.40$ typically indicates varied human pacing.

3. **Type-Token Ratio ($TTR$)**:
   Measures vocabulary richness as the ratio of unique lexical stems to total words:
   $$TTR = \frac{|\text{Vocabulary}|}{\text{Total Tokens}}$$

### 1.2 Limitations & False-Positive Risk Disclosure
- **Explicit Labeling**: The analyzer is labeled as an **Experimental Statistical Linguistic Analyzer**, not a validated neural classifier (such as RoBERTa-large-openai-detector or Binoculars).
- **High False-Positive Risk**: Structured technical writing, legal contracts, patent applications, and non-native English (ESL) academic prose inherently utilize consistent sentence structures and controlled vocabularies. These legitimate human texts frequently produce elevated uniformity scores.
- **Ethical Directive**: Output scores must **never** be used as sole evidence for academic discipline, employment penalties, or student misconduct allegations.

---

## 2. Plagiarism Detection: MinHash Jaccard Estimation & Inverted Indexing

### 2.1 Shingling & MinHash Architecture
ShivQuill implements a scalable document similarity architecture:

1. **Tokenization & Normalization**: Text is stripped of punctuation and tokenized into lowercased word arrays:
   $$T = [w_1, w_2, \dots, w_m]$$
2. **Contiguous $k$-Gram Shingling ($k=5$)**:
   Each document is converted into a set of 5-gram contiguous word tuples:
   $$S_k(D) = \{(w_i, w_{i+1}, w_{i+2}, w_{i+3}, w_{i+4}) \mid 1 \le i \le m - k + 1\}$$
3. **Inverted Shingle Postings Index**:
   Maps each observed 5-gram shingle to the set of document IDs containing it:
   $$\text{Index}: \text{shingle}_j \mapsto \{\text{doc}_a, \text{doc}_b, \dots\}$$
   Enables sub-millisecond candidate document discovery without pairwise all-to-all comparisons.
4. **MinHash Fingerprinting ($h=64$)**:
   Calculates 64 deterministic hash permutations using 32-bit FNV-1a hashing and linear congruential permutations:
   $$h_i(x) = (a_i \cdot x + b_i) \pmod p$$
   By the MinHash Theorem, the probability that two document signatures agree at index $i$ equals their exact Jaccard similarity:
   $$\Pr[h_i(A) = h_i(B)] = J(A, B) = \frac{|A \cap B|}{|A \cup B|}$$

### 2.2 Scope & Boundary Transparency
- **Local & Open-Access Reference Index**: The scanner checks against indexed open-access literature (arXiv, W3C standards, IPCC reports, open research datasets).
- **Web Crawler Boundary**: It is **not** an exhaustive live internet crawler (such as commercial services with billions of indexed paywalled pages).
- **Corpus Ingestion Security**:
  - `POST /api/originality/corpus` is protected by constant-time `CORPUS_ADMIN_KEY` authentication (`crypto.timingSafeEqual`).
  - SSRF protections disallow private IPs (`10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`), loopbacks (`127.0.0.1`, `localhost`), and non-HTTP protocols.
  - Document text is bounded to 50,000 characters per entry to prevent unbounded memory growth.

---

## 3. Academic Citation Generator

### 3.1 Supported Styles
- **APA 7th Edition**: Author-date parenthetical citation with italicized titles.
- **MLA 9th Edition**: Author-page in-text citation with quoted article titles.
- **Chicago 17th Edition**: Full bibliographic author-date formatting.
- **Harvard**: Author-date with specific access date markers for online resources.

### 3.2 Real-World Crossref DOI Resolution
When supplied with a digital object identifier (e.g. `10.1038/s41586-020-2649-2` or `https://doi.org/...`), the engine queries the **Crossref REST API** directly with a 4-second timeout to resolve authoritative metadata (registered journal container, publication year, volume/issue, and verified author list). If DOI lookup succeeds, the citation is marked with `isVerified: true` and `sourceOrigin: 'crossref_doi'`.
