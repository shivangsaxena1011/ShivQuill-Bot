<template>
  <div class="stack">
    <div class="alert warn small">
      <CircleAlert />
      <span>Scores are signals, not verdicts. Formal, technical or non-native writing can be flagged by mistake — never use a detector score alone to accuse or grade anyone.</span>
    </div>

    <StatusBits kind="error" :message="req.error.value" @dismiss="req.error.value = ''" />

    <div class="split-side">
      <div class="card pane">
        <div class="pane-head">
          <span class="pane-title">{{ result ? 'Sentence view' : 'Text to analyze' }}</span>
          <div class="row">
            <button v-if="result" class="btn btn-ghost btn-sm" type="button" @click="result = null">Edit text</button>
            <template v-else>
              <button class="btn btn-ghost btn-sm" type="button" :disabled="req.loading.value" @click="input = SAMPLE_AI">Try AI sample</button>
              <button class="btn btn-ghost btn-sm" type="button" :disabled="req.loading.value" @click="input = SAMPLE_HUMAN">Try human sample</button>
            </template>
          </div>
        </div>
        <div v-if="result" class="pane-body output-text">
          <template v-for="(p, i) in pieces" :key="i">
            <span
              v-if="p.s"
              :class="[`c-${p.s.label}`, 'sentence-pick', { picked: picked === p.s }]"
              :title="`${labelText(p.s.label)} · ${p.s.aiLikelihood}%${p.s.reason ? ' — ' + p.s.reason : ''}`"
              tabindex="0"
              role="button"
              :aria-label="`${labelText(p.s.label)}, ${p.s.aiLikelihood}%. Show why`"
              @click="picked = p.s"
              @keydown.enter.prevent="picked = p.s"
              @keydown.space.prevent="picked = p.s"
            >{{ p.text }}</span>
            <span v-else>{{ p.text }}</span>
          </template>
          <p v-if="result.truncated" class="faint small" style="margin-top: 10px">
            Analyzed the first {{ result.analyzedWords.toLocaleString() }} of {{ result.totalWords.toLocaleString() }} words.
          </p>
        </div>
        <textarea v-else v-model="input" class="editor" :disabled="req.loading.value" :placeholder="`Paste at least ${MIN_WORDS} words (80+ gives better results)…`" aria-label="Text to analyze"></textarea>
        <div class="pane-foot">
          <div class="legend" v-if="result">
            <span><i style="background: var(--c-ai)"></i>AI-generated</span>
            <span><i style="background: var(--c-ai-refined)"></i>AI-refined</span>
            <span><i style="background: var(--c-human-refined)"></i>Human, AI-refined</span>
          </div>
          <span v-else class="small" :class="words < MIN_WORDS ? 'muted' : 'faint'">
            {{ words.toLocaleString() }} words{{ words < MIN_WORDS ? ` · ${MIN_WORDS - words} more needed` : '' }}
          </span>
          <div class="row">
            <button v-if="req.loading.value" class="btn btn-danger btn-sm" type="button" @click="req.cancel()"><Square /> Stop</button>
            <button class="btn btn-primary" type="button" :disabled="req.loading.value || words < MIN_WORDS" @click="run">
              <ScanSearch /> {{ req.loading.value ? 'Detecting…' : 'Detect AI' }}
            </button>
          </div>
        </div>
      </div>

      <div class="card card-pad stack">
        <StatusBits v-if="req.loading.value" kind="loading" :message="status || 'Analyzing writing patterns…'" />

        <template v-else-if="result">
          <div class="score-hero">
            <div class="score-ring" :style="{ '--p': result.aiPercentage, '--c': ringColor }"><div>{{ result.aiPercentage }}%</div></div>
            <div class="stack" style="gap: 4px">
              <strong>of text is likely AI</strong>
              <span class="small muted">{{ result.overallVerdict }}</span>
              <span class="badge" :class="result.confidence === 'High' ? 'ok' : result.confidence === 'Moderate' ? 'brand' : 'warn'" style="align-self: flex-start">
                {{ result.confidence }} confidence
              </span>
            </div>
          </div>

          <p class="small">{{ result.summary }}</p>

          <div v-if="picked" class="explainer" :class="picked.label" aria-live="polite">
            <div class="spread tiny" style="margin-bottom: 4px">
              <strong>Selected sentence · {{ labelText(picked.label) }}</strong>
              <button class="btn btn-ghost btn-sm" type="button" style="padding: 0 6px" @click="picked = null">Close</button>
            </div>
            <div class="muted">“{{ picked.text.length > 220 ? picked.text.slice(0, 217) + '…' : picked.text }}”</div>
            <div style="margin-top: 4px">{{ picked.aiLikelihood }}% AI likelihood{{ picked.reason ? ` — ${picked.reason}` : '' }}</div>
          </div>

          <div class="bar-rows">
            <div v-for="b in breakdownRows" :key="b.label" class="bar-row">
              <i :style="{ background: b.color, outline: b.outline ? '1px solid var(--border-strong)' : 'none' }"></i>
              <span>{{ b.label }}</span>
              <strong>{{ b.value }}%</strong>
            </div>
          </div>

          <div v-if="result.explanations.length" class="stack" style="gap: 8px">
            <span class="pane-title">Why it was flagged</span>
            <div v-for="(e, i) in result.explanations" :key="i" class="explainer" :class="e.label">
              <div class="spread tiny" style="margin-bottom: 4px">
                <strong>{{ labelText(e.label) }}</strong><span class="faint">{{ e.aiLikelihood }}%</span>
              </div>
              <div class="muted">“{{ e.text }}”</div>
              <div v-if="e.reason" style="margin-top: 4px">{{ e.reason }}</div>
            </div>
          </div>

          <div v-if="result.signals.length" class="stack" style="gap: 4px">
            <span class="pane-title">Signals</span>
            <ul class="small muted" style="margin: 0; padding-left: 18px">
              <li v-for="(s, i) in result.signals" :key="i">{{ s }}</li>
            </ul>
          </div>

          <details class="small">
            <summary class="muted" style="cursor: pointer">Writing statistics</summary>
            <div class="stats" style="margin-top: 8px">
              <div class="stat"><div class="stat-label">Word variety</div><div class="stat-value">{{ result.metrics.typeTokenRatio }}</div><div class="stat-note">unique / total words</div></div>
              <div class="stat"><div class="stat-label">Rhythm</div><div class="stat-value">{{ result.metrics.sentenceLengthCV }}</div><div class="stat-note">sentence length variation</div></div>
              <div class="stat"><div class="stat-label">AI phrases</div><div class="stat-value">{{ result.metrics.aiPhraseCount }}</div><div class="stat-note">overused by models</div></div>
              <div class="stat"><div class="stat-label">Words</div><div class="stat-value">{{ result.analyzedWords.toLocaleString() }}</div><div class="stat-note">more text = better</div></div>
            </div>
          </details>
          <p class="tiny faint">{{ result.methodNote }} {{ result.falsePositiveRisk }}</p>
        </template>

        <StatusBits v-else kind="empty" message="The AI score, sentence highlights and explanations will appear here.">
          <template #icon><ScanSearch /></template>
        </StatusBits>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CircleAlert, ScanSearch, Square } from 'lucide-vue-next';
import StatusBits from '../components/StatusBits.vue';
import { api, type AiLabel, type DetectorResult } from '../api';
import { useRequest } from '../composables/useRequest';
import { useToolInput } from '../store';
import { analysisWordCount } from '../lib/text';

const MIN_WORDS = 40;
const SAMPLE_AI =
  'Artificial intelligence has emerged as a transformative force across numerous industries, reshaping the way organizations operate and deliver value. By leveraging advanced machine learning algorithms, businesses can streamline processes, enhance decision-making, and unlock new opportunities for growth. Furthermore, the integration of AI-driven solutions enables companies to analyze vast amounts of data with unprecedented speed and accuracy. In conclusion, while artificial intelligence offers immense potential, organizations must adopt a balanced and responsible approach to ensure sustainable success.';
const SAMPLE_HUMAN =
  "I burned the toast again this morning, which is honestly a talent at this point. My sister texted at 7:40 asking whether I'd remembered her birthday (I had not). We ended up at the noodle place on 5th Street, the one with the flickering sign, and she laughed about it the whole time. Next year I'm setting three alarms and buying the cake a week early.";

const input = useToolInput('detector', SAMPLE_AI);
const result = ref<DetectorResult | null>(null);
const picked = ref<DetectorResult['sentences'][number] | null>(null);
const checkedText = ref('');
const status = ref('');
const req = useRequest();
// A result only describes the text it was run on (e.g. text loaded from the Library replaces it)
// New text during a scan cancels that scan, so its result can't land on the wrong document.
watch(input, () => {
  if (req.loading.value) req.cancel();
  result.value = null;
});
watch(result, () => (picked.value = null));

// Counted like the server does (so the button agrees with the backend, incl. Chinese/Japanese/Thai)
// Debounced so typing in a very long text doesn't re-count every keystroke
const words = ref(analysisWordCount(input.value));
let countTimer: ReturnType<typeof setTimeout> | undefined;
watch(input, v => {
  clearTimeout(countTimer);
  countTimer = setTimeout(() => (words.value = analysisWordCount(v)), 150);
});

// Sentences carry exact offsets, so the original text (with its spacing and line breaks) is kept
const pieces = computed(() => {
  const r = result.value;
  if (!r) return [];
  const text = checkedText.value;
  const out: Array<{ text: string; s?: DetectorResult['sentences'][number] }> = [];
  let pos = 0;
  for (const s of r.sentences.slice(0, 2000)) {
    if (s.start > pos) out.push({ text: text.slice(pos, s.start) });
    out.push({ text: text.slice(s.start, s.end), s });
    pos = s.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
});

const ringColor = computed(() => {
  const p = result.value?.aiPercentage ?? 0;
  return p >= 60 ? 'var(--bad)' : p >= 25 ? 'var(--warn)' : 'var(--ok)';
});
const breakdownRows = computed(() => {
  const b = result.value?.breakdown;
  return [
    { label: 'AI-generated', value: b?.aiGenerated ?? 0, color: 'var(--c-ai)' },
    { label: 'AI-generated & AI-refined', value: b?.aiRefined ?? 0, color: 'var(--c-ai-refined)' },
    { label: 'Human-written & AI-refined', value: b?.humanRefined ?? 0, color: 'var(--c-human-refined)' },
    { label: 'Human-written', value: b?.human ?? 0, color: 'var(--surface)', outline: true }
  ];
});

const labelText = (l: AiLabel) =>
  ({ ai: 'AI-generated', ai_refined: 'AI-generated & AI-refined', human_refined: 'Human-written & AI-refined', human: 'Human-written' })[l];

async function run() {
  const text = input.value;
  status.value = '';
  const r = await req.run(signal => api.detector(text, { signal, onStatus: m => (status.value = m) }));
  // Only show the result if it still describes the text in the box
  if (r && input.value === text) {
    checkedText.value = text;
    result.value = r;
  }
}
</script>
