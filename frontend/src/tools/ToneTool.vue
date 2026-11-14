<template>
  <div class="stack">
    <StatusBits kind="error" :message="analyzeReq.error.value || rewriteReq.error.value" @dismiss="analyzeReq.error.value = ''; rewriteReq.error.value = ''" />

    <div class="split">
      <EditorPane v-model="input" tool="tone" title="Your text" placeholder="Paste an email, post or paragraph to check how it sounds…" @submit="analyze">
        <template #head><button class="btn btn-ghost btn-sm" type="button" @click="input = sample">Sample</button></template>
        <template #foot>
          <button class="btn btn-primary" type="button" :disabled="analyzeReq.loading.value || input.trim().length < 20" @click="analyze">
            <Gauge /> {{ analyzeReq.loading.value ? 'Analyzing…' : 'Analyze tone' }}
          </button>
        </template>
      </EditorPane>

      <div class="card pane">
        <div class="pane-head"><span class="pane-title">How it sounds</span></div>
        <div class="pane-body stack">
          <StatusBits v-if="analyzeReq.loading.value" kind="loading" message="Reading the tone…" />
          <template v-else-if="analysis">
            <div>
              <div class="spread"><span class="stat-label">Overall</span><span class="badge" :class="sentimentClass">{{ analysis.sentiment }}</span></div>
              <div class="stat-value" style="margin-top: 2px">{{ analysis.primaryTone }}</div>
              <p class="small muted" style="margin-top: 4px">{{ analysis.summary }}</p>
            </div>
            <div class="stack" style="gap: 8px">
              <div v-for="t in analysis.tones" :key="t.name">
                <div class="spread small"><span>{{ t.name }}</span><span class="muted">{{ t.score }}</span></div>
                <div class="meter" style="height: 7px; margin-top: 3px"><span :style="{ width: `${t.score}%`, background: 'var(--brand)' }"></span></div>
              </div>
            </div>
            <div class="stats">
              <div class="stat"><div class="stat-label">Formality</div><div class="stat-value">{{ analysis.formality }}</div><div class="stat-note">0 casual · 100 formal</div></div>
              <div class="stat"><div class="stat-label">Confidence</div><div class="stat-value">{{ analysis.confidence }}</div><div class="stat-note">how assertive it sounds</div></div>
            </div>
            <p v-if="analysis.sampled" class="tiny faint">Long text: the beginning and end were analyzed.</p>
          </template>
          <StatusBits v-else kind="empty" message="Analyze your text to see its tone, formality and confidence.">
            <template #icon><Gauge /></template>
          </StatusBits>
        </div>
      </div>
    </div>

    <div class="card card-pad stack">
      <div class="spread">
        <strong>Change the tone</strong>
        <div class="row">
          <button v-if="rewriteReq.loading.value" class="btn btn-danger btn-sm" type="button" @click="rewriteReq.cancel()"><Square /> Stop</button>
          <template v-if="rewrite && !rewriteReq.loading.value">
            <button class="btn btn-ghost btn-sm btn-icon" type="button" title="Copy" @click="copyText(rewrite.rewrittenText)"><Copy /></button>
            <ExportMenu :text="rewrite.rewrittenText" :title="`Text in a ${rewrite.tone} tone`" />
            <button class="btn btn-sm" type="button" @click="useRewrite">Use as my text</button>
          </template>
        </div>
      </div>
      <div class="chip-row">
        <button v-for="t in targets" :key="t.id" type="button" class="chip" :class="{ active: target === t.id }" :disabled="rewriteReq.loading.value || !input.trim()" :title="t.hint" @click="rewriteTo(t.id)">{{ t.label }}</button>
      </div>
      <div v-if="rewriteReq.loading.value || rewrite" class="output-box">
        <div v-if="rewriteReq.loading.value" class="output-text streaming">{{ live.visible.value || 'Rewriting…' }}</div>
        <DiffView v-else-if="rewrite" :diff-spans="rewrite.diffSpans" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Copy, Gauge, Square } from 'lucide-vue-next';
import EditorPane from '../components/EditorPane.vue';
import StatusBits from '../components/StatusBits.vue';
import DiffView from '../components/DiffView.vue';
import ExportMenu from '../components/ExportMenu.vue';
import { api, type ToneAnalysis, type ToneRewriteResult } from '../api';
import { useRequest } from '../composables/useRequest';
import { useLiveText } from '../composables/useLiveText';
import { copyText, useToolInput } from '../store';
import { addHistory } from '../lib/db';

const sample = "Hey, just checking if you got my last email?? We really need this done by Friday or we're gonna have a problem.";
const targets = [
  { id: 'formal', label: 'Formal', hint: 'Professional, precise' },
  { id: 'friendly', label: 'Friendly', hint: 'Warm, approachable' },
  { id: 'confident', label: 'Confident', hint: 'Direct, no hedging' },
  { id: 'persuasive', label: 'Persuasive', hint: 'Compelling, benefit-focused' },
  { id: 'empathetic', label: 'Empathetic', hint: 'Considerate, supportive' },
  { id: 'diplomatic', label: 'Diplomatic', hint: 'Tactful, constructive' },
  { id: 'neutral', label: 'Neutral', hint: 'Objective, factual' },
  { id: 'casual', label: 'Casual', hint: 'Relaxed, everyday' }
];

const input = useToolInput('tone', sample);
const analysis = ref<ToneAnalysis | null>(null);
const rewrite = ref<ToneRewriteResult | null>(null);
const target = ref('');
const analyzeReq = useRequest();
const rewriteReq = useRequest();
const live = useLiveText();

const sentimentClass = computed(() => ({ positive: 'ok', negative: 'bad', mixed: 'warn', neutral: '' }[analysis.value?.sentiment || 'neutral']));

async function analyze() {
  if (input.value.trim().length < 20 || analyzeReq.loading.value) return;
  const r = await analyzeReq.run(signal => api.toneAnalyze(input.value, { signal }));
  if (r) analysis.value = r;
}

async function rewriteTo(tone: string) {
  if (!input.value.trim() || rewriteReq.loading.value) return;
  target.value = tone;
  live.reset();
  const text = input.value;
  const r = await rewriteReq.run(signal => api.toneRewrite(text, tone, { signal, onDelta: live.append }));
  if (r) {
    rewrite.value = r;
    addHistory({ tool: 'tone', label: `Tone → ${tone}`, input: text, output: r.rewrittenText });
  }
}

function useRewrite() {
  if (!rewrite.value) return;
  input.value = rewrite.value.rewrittenText;
  rewrite.value = null;
  analysis.value = null;
}
</script>
