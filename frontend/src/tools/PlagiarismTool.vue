<template>
  <div class="stack">
    <div class="alert info small">
      <ShieldCheck />
      <span>Checks your text against ShivQuill's indexed reference library (open-access papers and standards) — not the whole web.</span>
    </div>

    <StatusBits kind="error" :message="req.error.value" @dismiss="req.error.value = ''" />

    <div class="split-side">
      <div class="card pane">
        <div class="pane-head">
          <span class="pane-title">{{ result ? 'Matches highlighted' : 'Text to check' }}</span>
          <button v-if="result" class="btn btn-ghost btn-sm" type="button" @click="result = null">Edit text</button>
          <button v-else class="btn btn-ghost btn-sm" type="button" @click="input = sample">Sample</button>
        </div>
        <div v-if="result" class="pane-body output-text">
          <template v-for="(p, i) in highlighted" :key="i">
            <mark v-if="p.mark" class="hl-match" :title="p.title">{{ p.text }}</mark>
            <span v-else>{{ p.text }}</span>
          </template>
        </div>
        <textarea v-else v-model="input" class="editor" placeholder="Paste text to check for copied passages…" aria-label="Text to check"></textarea>
        <div class="pane-foot">
          <span>{{ result ? `${result.totalWordsChecked.toLocaleString()} words checked` : '' }}</span>
          <button class="btn btn-primary" type="button" :disabled="req.loading.value || input.trim().length < 10" @click="run">
            <ShieldCheck /> {{ req.loading.value ? 'Checking…' : 'Check' }}
          </button>
        </div>
      </div>

      <div class="card card-pad stack">
        <template v-if="result">
          <div class="stats">
            <div class="stat"><div class="stat-label">Matched</div><div class="stat-value" :style="{ color: result.similarityScore > 20 ? 'var(--bad)' : 'var(--ok)' }">{{ result.similarityScore }}%</div></div>
            <div class="stat"><div class="stat-label">Unique</div><div class="stat-value">{{ result.uniquenessScore }}%</div></div>
          </div>
          <div v-if="result.matchedSources.length" class="stack" style="gap: 8px">
            <span class="pane-title">Sources</span>
            <a v-for="s in result.matchedSources" :key="s.id" :href="s.url" target="_blank" rel="noopener noreferrer" class="source-card" style="text-decoration: none; color: inherit">
              <div class="spread"><strong class="small">{{ s.title }}</strong><span class="badge bad">{{ s.matchedPercent }}%</span></div>
              <span class="tiny faint">{{ s.authorOrSource }}</span>
            </a>
          </div>
          <p v-else class="small muted">No matching passages found in {{ result.corpusStats.indexedDocuments }} indexed documents.</p>
        </template>
        <StatusBits v-else kind="empty" message="Similarity score and matching sources will appear here.">
          <template #icon><ShieldCheck /></template>
        </StatusBits>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ShieldCheck } from 'lucide-vue-next';
import StatusBits from '../components/StatusBits.vue';
import { api, type PlagiarismResult } from '../api';
import { useRequest } from '../composables/useRequest';
import { persisted, shareToolText } from '../store';
import { highlightRanges } from '../lib/text';

const sample = 'Deeper neural networks are more difficult to train. We present a residual learning framework to ease the training of networks that are substantially deeper than those used previously. My own conclusion is that this idea changed computer vision.';
const input = persisted('plagiarism', sample);
shareToolText('plagiarism', input);
const result = ref<PlagiarismResult | null>(null);
const checkedText = ref('');
const req = useRequest();

const highlighted = computed(() => {
  if (!result.value) return [];
  const ranges = result.value.matchedSegments
    .filter(s => typeof s.start === 'number' && typeof s.end === 'number')
    .map(s => ({ start: s.start!, end: s.end!, title: s.sourceTitle }));
  return highlightRanges(checkedText.value, ranges);
});

async function run() {
  const text = input.value;
  const r = await req.run(signal => api.plagiarism(text, { signal }));
  if (r) {
    checkedText.value = text;
    result.value = r;
  }
}
</script>
