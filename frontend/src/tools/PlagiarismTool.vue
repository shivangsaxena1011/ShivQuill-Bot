<template>
  <div class="stack">
    <div class="alert info small">
      <ShieldCheck />
      <span>Searches the public web, Wikipedia and scholarly indexes (Crossref, OpenAlex, arXiv) plus ShivQuill's reference library, then compares your text word by word. Free sources can't cover everything (e.g. paywalled papers), so a low score is not a guarantee.</span>
    </div>

    <StatusBits kind="error" :message="req.error.value" @dismiss="req.error.value = ''" />

    <div class="split-side">
      <div class="card pane">
        <div class="pane-head">
          <span class="pane-title">{{ result ? 'Matches highlighted' : 'Text to check' }}</span>
          <div class="row">
            <button v-if="result && selectedId" class="btn btn-ghost btn-sm" type="button" @click="selectedId = ''">Show all matches</button>
            <button v-if="result" class="btn btn-ghost btn-sm" type="button" @click="result = null">Edit text</button>
            <button v-else class="btn btn-ghost btn-sm" type="button" :disabled="req.loading.value" @click="input = sample">Sample</button>
          </div>
        </div>
        <div v-if="result" class="pane-body output-text">
          <template v-for="(p, i) in highlighted" :key="i">
            <mark
              v-if="p.seg"
              :class="[`m-${matchClass(p.seg.matchType)}`, { dim: selectedId && p.seg.sourceId !== selectedId, focus: focusedSeg === p.seg }]"
              :title="`${typeLabel(p.seg.matchType)} · ${p.seg.sourceTitle}`"
              @click="selectSegment(p.seg)"
            >{{ p.text }}</mark>
            <span v-else>{{ p.text }}</span>
          </template>
        </div>
        <textarea v-else v-model="input" class="editor" :disabled="req.loading.value" placeholder="Paste text to check for copied passages…" aria-label="Text to check"></textarea>
        <div class="pane-foot">
          <div class="row small muted" style="gap: 14px">
            <span>{{ (result ? result.totalWordsChecked : words).toLocaleString() }} words</span>
            <label v-if="!result" class="row" style="gap: 6px; cursor: pointer">
              <input v-model="excludeQuotes" type="checkbox" :disabled="req.loading.value" /> Exclude quotes
            </label>
            <div v-else class="legend">
              <span><i style="background: var(--m-identical)"></i>Identical</span>
              <span><i style="background: var(--m-minor)"></i>Minor changes</span>
              <span><i style="background: var(--m-para)"></i>Paraphrased</span>
            </div>
          </div>
          <div class="row">
            <button v-if="req.loading.value" class="btn btn-danger btn-sm" type="button" @click="req.cancel()"><Square /> Stop</button>
            <button class="btn btn-primary" type="button" :disabled="req.loading.value || words < MIN_WORDS" :title="words < MIN_WORDS ? `Add at least ${MIN_WORDS} words` : ''" @click="run">
              <ShieldCheck /> {{ req.loading.value ? 'Scanning…' : 'Scan for plagiarism' }}
            </button>
          </div>
        </div>
      </div>

      <div class="card card-pad stack">
        <StatusBits v-if="req.loading.value" kind="loading" :message="status || 'Starting scan…'" />

        <template v-else-if="result">
          <div class="score-hero">
            <div class="score-ring" :style="{ '--p': result.similarityScore, '--c': scoreColor }"><div>{{ result.similarityScore }}%</div></div>
            <div class="stack" style="gap: 4px">
              <strong>{{ verdict }}</strong>
              <span class="small muted">{{ result.matchedWords.toLocaleString() }} of {{ result.totalWordsChecked.toLocaleString() }} words match other sources · {{ result.uniquenessScore }}% unique</span>
              <span v-if="result.excludedQuotedWords" class="tiny faint">{{ result.excludedQuotedWords }} quoted words excluded</span>
            </div>
          </div>

          <div class="bar-rows">
            <div v-for="b in breakdownRows" :key="b.label" class="bar-row">
              <i :style="{ background: b.color }"></i>
              <span>{{ b.label }}</span>
              <strong>{{ b.value }}%</strong>
            </div>
          </div>

          <div v-if="result.matchedSources.length" class="stack" style="gap: 8px">
            <span class="pane-title">Sources ({{ result.matchedSources.length }})</span>
            <button
              v-for="s in result.matchedSources"
              :key="s.id"
              type="button"
              class="source-card selectable"
              :class="{ selected: selectedId === s.id }"
              :aria-pressed="selectedId === s.id"
              @click="selectedId = selectedId === s.id ? '' : s.id"
            >
              <div class="spread" style="gap: 10px; align-items: flex-start">
                <span class="source-title">{{ s.title }}</span>
                <span class="badge" :class="s.matchedPercent >= 20 ? 'bad' : 'warn'">{{ s.matchedPercent }}%</span>
              </div>
              <div class="source-meta tiny faint">
                <span class="badge">{{ kindLabel(s.kind) }}</span>
                <span>{{ s.authorOrSource }}</span>
                <span v-if="s.snippetOnly" title="The page couldn't be downloaded; only the search result snippet was compared">· snippet only</span>
              </div>
              <div class="tiny muted">
                <template v-if="s.identicalWords">{{ s.identicalWords }} identical</template>
                <template v-if="s.minorChangesWords"> · {{ s.minorChangesWords }} minor changes</template>
                <template v-if="s.paraphrasedWords"> · {{ s.paraphrasedWords }} paraphrased</template>
              </div>
            </button>
          </div>
          <p v-else class="small muted">No matching passages were found in the sources searched.</p>

          <div v-if="selected" class="stack" style="gap: 8px">
            <div class="spread">
              <span class="pane-title">Matches with this source</span>
              <a v-if="isLink(selected.url)" :href="selected.url" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm"><ExternalLink /> Open</a>
            </div>
            <div v-for="(seg, i) in selectedSegments.slice(0, 8)" :key="i" class="compare-pair">
              <span class="lbl">Your text · {{ typeLabel(seg.matchType) }}</span>
              <span>{{ clip(seg.text) }}</span>
              <span v-if="seg.sourceExcerpt" class="lbl">Source</span>
              <span v-if="seg.sourceExcerpt" class="muted">{{ seg.sourceExcerpt }}</span>
            </div>
          </div>

          <details class="small">
            <summary class="muted" style="cursor: pointer">What was searched ({{ (result.coverage.durationMs / 1000).toFixed(1) }}s)</summary>
            <div class="stack" style="gap: 8px; margin-top: 8px">
              <p class="tiny" :class="result.coverage.complete ? 'faint' : 'muted'">{{ result.coverage.note }}</p>
              <div class="provider-chips">
                <span v-for="p in result.coverage.providers" :key="p.id" class="badge" :class="providerClass(p.status)" :title="p.message || ''">
                  {{ p.label }} · {{ providerText(p.status) }}
                </span>
              </div>
              <p class="tiny faint">{{ result.coverage.sourcesCompared }} sources compared · {{ result.coverage.queries.length }} search phrases · {{ result.corpusStats.indexedDocuments }} library documents</p>
            </div>
          </details>
        </template>

        <StatusBits v-else kind="empty" message="Plagiarism score, matching sources and highlighted passages will appear here.">
          <template #icon><ShieldCheck /></template>
        </StatusBits>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ExternalLink, ShieldCheck, Square } from 'lucide-vue-next';
import StatusBits from '../components/StatusBits.vue';
import { api, type MatchType, type PlagiarismResult, type SourceKind } from '../api';
import { useRequest } from '../composables/useRequest';
import { useToolInput } from '../store';
import { wordCount } from '../lib/text';

type Segment = PlagiarismResult['matchedSegments'][number];

const MIN_WORDS = 15;
const sample =
  'Deeper neural networks are more difficult to train. We present a residual learning framework to ease the training of networks that are substantially deeper than those used previously. My own conclusion is that this idea changed computer vision.';
const input = useToolInput('plagiarism', sample);
const excludeQuotes = ref(false);
const result = ref<PlagiarismResult | null>(null);
const checkedText = ref('');
const selectedId = ref('');
const focusedSeg = ref<Segment | null>(null);
const status = ref('');
const req = useRequest();
// A result only describes the text it was run on (e.g. text loaded from the Library replaces it)
watch(input, () => (result.value = null));
watch(result, () => {
  selectedId.value = '';
  focusedSeg.value = null;
});

const words = computed(() => wordCount(input.value));

/** Non-overlapping highlight pieces; where sources overlap, the strongest match type wins. */
const highlighted = computed(() => {
  const r = result.value;
  if (!r) return [];
  const text = checkedText.value;
  const rank: Record<MatchType, number> = { identical: 3, minor: 2, paraphrased: 1 };
  const owner: Array<Segment | undefined> = new Array(text.length);
  const segs = [...r.matchedSegments].sort((a, b) => {
    // the selected source's segments take priority, then stronger match types
    const sel = Number(b.sourceId === selectedId.value) - Number(a.sourceId === selectedId.value);
    return sel || rank[b.matchType] - rank[a.matchType];
  });
  for (const s of segs) {
    for (let i = Math.max(0, s.start); i < Math.min(text.length, s.end); i++) if (!owner[i]) owner[i] = s;
  }
  const parts: Array<{ text: string; seg?: Segment }> = [];
  let i = 0;
  while (i < text.length) {
    const seg = owner[i];
    let j = i + 1;
    while (j < text.length && owner[j] === seg) j++;
    parts.push({ text: text.slice(i, j), seg });
    i = j;
  }
  return parts;
});

const selected = computed(() => result.value?.matchedSources.find(s => s.id === selectedId.value) || null);
const selectedSegments = computed(() => (result.value?.matchedSegments || []).filter(s => s.sourceId === selectedId.value));

const scoreColor = computed(() => {
  const s = result.value?.similarityScore ?? 0;
  return s >= 30 ? 'var(--bad)' : s >= 10 ? 'var(--warn)' : 'var(--ok)';
});
const verdict = computed(() => {
  const s = result.value?.similarityScore ?? 0;
  if (s === 0) return 'No plagiarism found';
  if (s < 10) return 'Low similarity';
  if (s < 30) return 'Some matching text';
  return 'Significant matching text';
});
const breakdownRows = computed(() => {
  const b = result.value?.breakdown;
  return [
    { label: 'Identical', value: b?.identical ?? 0, color: 'var(--m-identical)' },
    { label: 'Minor changes', value: b?.minorChanges ?? 0, color: 'var(--m-minor)' },
    { label: 'Paraphrased', value: b?.paraphrased ?? 0, color: 'var(--m-para)' }
  ];
});

const matchClass = (t: MatchType) => (t === 'paraphrased' ? 'para' : t);
const typeLabel = (t: MatchType) => (t === 'identical' ? 'Identical' : t === 'minor' ? 'Minor changes' : 'Paraphrased');
const kindLabel = (k: SourceKind) => ({ web: 'Web', wikipedia: 'Wikipedia', academic: 'Scholarly', local: 'Library' })[k];
const providerText = (s: string) =>
  ({ ok: 'searched', no_results: 'no matches', rate_limited: 'busy, skipped', blocked: 'unavailable', failed: 'error', skipped: 'not used' })[s] || s;
const providerClass = (s: string) => (s === 'ok' || s === 'no_results' ? 'ok' : s === 'skipped' ? '' : 'warn');
const clip = (s: string) => (s.length > 320 ? s.slice(0, 317) + '…' : s);
const isLink = (u: string) => /^https?:\/\//i.test(u);

function selectSegment(seg: Segment) {
  selectedId.value = seg.sourceId;
  focusedSeg.value = seg;
}

async function run() {
  const text = input.value;
  status.value = '';
  const r = await req.run(signal => api.plagiarism(text, excludeQuotes.value, { signal, onStatus: m => (status.value = m) }));
  if (r) {
    checkedText.value = text;
    result.value = r;
  }
}
</script>
