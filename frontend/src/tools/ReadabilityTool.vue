<template>
  <div class="stack">
    <div class="split-side">
      <div class="card pane">
        <div class="pane-head">
          <div class="tabs">
            <button class="tab" :class="{ active: view === 'edit' }" type="button" @click="view = 'edit'">Write</button>
            <button class="tab" :class="{ active: view === 'long' }" type="button" @click="view = 'long'">Long sentences</button>
            <button class="tab" :class="{ active: view === 'repeat' }" type="button" @click="view = 'repeat'">Repetition</button>
          </div>
          <button v-if="view === 'edit'" class="btn btn-ghost btn-sm" type="button" @click="input = sample">Sample</button>
        </div>
        <textarea v-if="view === 'edit'" v-model="input" class="editor" placeholder="Paste or write text — stats update as you type. Nothing is sent to the server." aria-label="Text to analyze"></textarea>
        <div v-else class="pane-body output-text">
          <template v-if="view === 'long'">
            <template v-for="(p, i) in longParts" :key="i">
              <mark v-if="p.mark" class="hl-long" :title="p.title">{{ p.text }}</mark><span v-else>{{ p.text }}</span>
            </template>
          </template>
          <template v-else>
            <template v-for="(p, i) in repeatParts" :key="i">
              <mark v-if="p.mark" class="hl-repeat" :title="p.title">{{ p.text }}</mark><span v-else>{{ p.text }}</span>
            </template>
          </template>
          <p v-if="input.length > PREVIEW_LIMIT" class="faint small" style="margin-top: 10px">Showing highlights for the first {{ PREVIEW_LIMIT.toLocaleString() }} characters.</p>
        </div>
        <div class="pane-foot">
          <span v-if="view === 'long'" class="legend"><span><i style="background: var(--warn-soft)"></i>Over 25 words</span></span>
          <span v-else-if="view === 'repeat'" class="legend"><span><i style="background: var(--hl-match)"></i>Same word used again within 12 words</span></span>
          <span v-else class="small muted">Analysis runs in your browser</span>
          <span v-if="report?.truncated" class="badge warn">first 300k chars analyzed</span>
        </div>
      </div>

      <div class="stack">
        <div class="card card-pad stack" v-if="report && report.words > 0">
          <div class="stats">
            <div class="stat"><div class="stat-label">Grade level</div><div class="stat-value">{{ report.gradeLevel }}</div><div class="stat-note">US school grade</div></div>
            <div class="stat"><div class="stat-label">Reading ease</div><div class="stat-value">{{ report.fleschReadingEase }}</div><div class="stat-note">{{ easeLabel(report.fleschReadingEase) }}</div></div>
            <div class="stat"><div class="stat-label">Reading time</div><div class="stat-value">{{ fmtMinutes(report.readingMinutes) }}</div><div class="stat-note">speaking {{ fmtMinutes(report.speakingMinutes) }}</div></div>
            <div class="stat"><div class="stat-label">Words</div><div class="stat-value">{{ report.words.toLocaleString() }}</div><div class="stat-note">{{ report.sentences }} sentences · {{ report.paragraphs }} paragraphs</div></div>
          </div>
          <div class="stats">
            <div class="stat"><div class="stat-label">Passive voice</div><div class="stat-value" :style="{ color: report.passivePercent > 20 ? 'var(--warn)' : '' }">{{ report.passivePercent }}%</div><div class="stat-note">{{ report.passiveCount }} sentences</div></div>
            <div class="stat"><div class="stat-label">Long sentences</div><div class="stat-value" :style="{ color: report.longSentences.length > 3 ? 'var(--warn)' : '' }">{{ longCount }}</div><div class="stat-note">over 25 words</div></div>
            <div class="stat"><div class="stat-label">Adverbs</div><div class="stat-value">{{ report.adverbCount }}</div><div class="stat-note">words ending in -ly</div></div>
            <div class="stat"><div class="stat-label">Avg sentence</div><div class="stat-value">{{ report.avgSentenceLength }}</div><div class="stat-note">words</div></div>
          </div>
        </div>

        <div v-if="report && report.sentenceList.length > 1" class="card card-pad">
          <div class="spread"><span class="pane-title">Sentence lengths</span><span class="tiny faint">{{ chartBars.length < report.sentenceList.length ? `first ${chartBars.length}` : 'all' }} sentences</span></div>
          <svg class="len-chart" :viewBox="`0 0 ${chartBars.length * 6} 60`" preserveAspectRatio="none" role="img" aria-label="Bar chart of sentence lengths in words">
            <line x1="0" :x2="chartBars.length * 6" :y1="60 - (25 / chartMax) * 56" :y2="60 - (25 / chartMax) * 56" class="len-chart-guide" />
            <rect v-for="(b, i) in chartBars" :key="i" :x="i * 6 + 1" :y="60 - (b / chartMax) * 56" width="4" :height="(b / chartMax) * 56" rx="1" :class="b > 25 ? 'bar-long' : 'bar'">
              <title>Sentence {{ i + 1 }}: {{ b }} words</title>
            </rect>
          </svg>
          <p class="tiny faint">Varied lengths read naturally. The dashed line marks 25 words.</p>
        </div>

        <div v-if="report && report.topWords.length" class="card card-pad">
          <div class="spread"><span class="pane-title">Most used words</span><span class="tiny faint">{{ report.uniqueWords.toLocaleString() }} unique</span></div>
          <div class="freq-list">
            <div v-for="w in report.topWords.slice(0, 15)" :key="w.word" class="freq-row">
              <span class="freq-word">{{ w.word }}</span>
              <span class="freq-bar"><span :style="{ width: `${(w.count / report.topWords[0].count) * 100}%` }"></span></span>
              <span class="tiny muted">{{ w.count }}</span>
            </div>
          </div>
        </div>

        <div v-if="!report || report.words === 0" class="card card-pad">
          <StatusBits kind="empty" message="Start typing or paste text to see readability, passive voice, sentence lengths and word frequency.">
            <template #icon><BookOpenCheck /></template>
          </StatusBits>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { BookOpenCheck } from 'lucide-vue-next';
import StatusBits from '../components/StatusBits.vue';
import { useToolInput } from '../store';
import { analyzeReadability, easeLabel, type ReadabilityReport } from '../lib/readability';
import { highlightRanges } from '../lib/text';

const sample = 'The report was written by the team over several weeks. It is very clear that the results were influenced by a number of factors that were not fully understood at the time, and that further research, which would ideally be conducted with a larger and more diverse sample, is needed before any firm conclusions can be drawn. The results are important. The results also suggest new questions.';
const input = useToolInput('readability', sample);
const view = ref<'edit' | 'long' | 'repeat'>('edit');
const report = shallowRef<ReadabilityReport | null>(null);
const PREVIEW_LIMIT = 30_000;

// Debounced analysis keeps typing smooth even for long documents
let timer: ReturnType<typeof setTimeout> | undefined;
watch(input, v => {
  clearTimeout(timer);
  timer = setTimeout(() => (report.value = analyzeReadability(v)), v.length > 20_000 ? 400 : 150);
}, { immediate: true });

const longCount = computed(() => report.value?.sentenceList.filter(s => s.words > 25).length ?? 0);
const chartBars = computed(() => (report.value?.sentenceList || []).slice(0, 120).map(s => s.words));
const chartMax = computed(() => Math.max(30, ...chartBars.value));

const longParts = computed(() => {
  if (!report.value || view.value !== 'long') return [];
  const text = input.value.slice(0, PREVIEW_LIMIT);
  const ranges = report.value.sentenceList
    .filter(s => s.words > 25 && s.start + s.text.length <= text.length)
    .map(s => ({ start: s.start, end: s.start + s.text.length, title: `${s.words} words${s.passive ? ' · passive voice' : ''}` }));
  return highlightRanges(text, ranges, 1000);
});

const repeatParts = computed(() => {
  if (!report.value || view.value !== 'repeat') return [];
  const text = input.value.slice(0, PREVIEW_LIMIT);
  const ranges = report.value.repetitions
    .filter(r => r.end <= text.length)
    .map(r => ({ start: r.start, end: r.end, title: `"${r.word}" repeated nearby` }));
  return highlightRanges(text, ranges, 1000);
});

function fmtMinutes(m: number) {
  if (m < 1) return `${Math.max(1, Math.round(m * 60))}s`;
  return `${Math.round(m)} min`;
}
</script>
