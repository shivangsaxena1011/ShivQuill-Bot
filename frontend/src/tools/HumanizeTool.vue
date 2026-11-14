<template>
  <div class="stack">
    <div class="card toolbar">
      <div class="chip-row">
        <button v-for="l in levels" :key="l.id" type="button" class="chip" :class="{ active: level === l.id }" :title="l.hint" @click="level = l.id">{{ l.label }}</button>
      </div>
    </div>

    <StatusBits kind="error" :message="req.error.value" @dismiss="req.error.value = ''" />

    <div class="split">
      <EditorPane v-model="input" tool="humanize" title="Original" placeholder="Paste stiff or AI-sounding text…" @submit="run">
        <template #head><button class="btn btn-ghost btn-sm" type="button" @click="input = sample">Sample</button></template>
        <template #foot>
          <button v-if="req.loading.value" class="btn btn-danger btn-sm" type="button" @click="req.cancel()"><Square /> Stop</button>
          <button class="btn btn-primary" type="button" :disabled="req.loading.value || !input.trim()" @click="run"><Sparkles /> Humanize</button>
        </template>
      </EditorPane>

      <div class="card pane">
        <div class="pane-head">
          <span class="pane-title">Natural version</span>
          <div v-if="result" class="row">
            <button class="btn btn-ghost btn-sm btn-icon" type="button" title="Copy" @click="copyText(result.humanizedText)"><Copy /></button>
            <ExportMenu :text="result.humanizedText" title="Humanized text" />
          </div>
        </div>
        <div class="pane-body">
          <template v-if="req.loading.value">
            <div v-if="live.text.value" class="output-text streaming">{{ live.visible.value }}</div>
            <StatusBits v-else kind="loading" message="Rewriting with a natural voice…" />
          </template>
          <DiffView v-else-if="result" :diff-spans="result.diffSpans" />
          <StatusBits v-else kind="empty" message="A more natural, human-sounding version will appear here.">
            <template #icon><Sparkles /></template>
          </StatusBits>
        </div>
        <div v-if="result && !req.loading.value" class="pane-foot">
          <div class="row-wrap">
            <span class="badge" :class="result.readabilityScore.burstiness === 'Low' ? 'warn' : 'ok'" title="How much sentence length varies">Rhythm: {{ result.readabilityScore.burstiness }}</span>
            <span class="badge brand" title="Readability (60%) + sentence variety (40%)">Flow {{ result.readabilityScore.flowScore }}/100</span>
            <span v-if="result.readabilityScore.fleschReadingEase !== undefined" class="badge" title="Flesch Reading Ease — higher is easier">Readability {{ result.readabilityScore.fleschReadingEase }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Copy, Sparkles, Square } from 'lucide-vue-next';
import EditorPane from '../components/EditorPane.vue';
import DiffView from '../components/DiffView.vue';
import StatusBits from '../components/StatusBits.vue';
import ExportMenu from '../components/ExportMenu.vue';
import { api, type HumanizeResult } from '../api';
import { useRequest } from '../composables/useRequest';
import { useLiveText } from '../composables/useLiveText';
import { copyText, useToolInput } from '../store';
import { addHistory } from '../lib/db';

const levels = [
  { id: 'conversational', label: 'Conversational', hint: 'Relaxed and friendly' },
  { id: 'natural', label: 'Natural', hint: 'Balanced, everyday voice' },
  { id: 'engaging', label: 'Engaging', hint: 'Lively, varied rhythm' }
];
const sample = 'Furthermore, it is crucial to remember that delving into this technological tapestry serves as a beacon of our innovation. In conclusion, the solution is a testament to our commitment.';

const input = useToolInput('humanize', sample);
const level = ref('natural');
const result = ref<HumanizeResult | null>(null);
const req = useRequest();
const live = useLiveText();

async function run() {
  if (!input.value.trim() || req.loading.value) return;
  live.reset();
  const text = input.value;
  const r = await req.run(signal => api.humanize(text, level.value, { signal, onDelta: live.append }));
  if (r) {
    result.value = r;
    addHistory({ tool: 'humanize', label: `Humanize · ${level.value}`, input: text, output: r.humanizedText });
  }
}
</script>
