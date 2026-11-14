<template>
  <div class="stack">
    <div class="card toolbar">
      <div class="tabs" role="tablist" aria-label="Summary format">
        <button class="tab" :class="{ active: format === 'bullet' }" type="button" @click="format = 'bullet'">Key points</button>
        <button class="tab" :class="{ active: format === 'paragraph' }" type="button" @click="format = 'paragraph'">Paragraph</button>
      </div>
      <div class="chip-row">
        <button v-for="l in lengths" :key="l" type="button" class="chip" :class="{ active: length === l }" @click="length = l">{{ l[0].toUpperCase() + l.slice(1) }}</button>
      </div>
    </div>

    <StatusBits kind="error" :message="req.error.value" @dismiss="req.error.value = ''" />

    <div class="split">
      <EditorPane v-model="input" tool="summarize" title="Document" placeholder="Paste an article, report or notes to summarize…" @submit="run">
        <template #head><button class="btn btn-ghost btn-sm" type="button" @click="input = sample">Sample</button></template>
        <template #foot>
          <button v-if="req.loading.value" class="btn btn-danger btn-sm" type="button" @click="req.cancel()"><Square /> Stop</button>
          <button class="btn btn-primary" type="button" :disabled="req.loading.value || !input.trim()" @click="run"><FileText /> Summarize</button>
        </template>
      </EditorPane>

      <div class="card pane">
        <div class="pane-head">
          <div class="row">
            <span class="pane-title">Summary</span>
            <span v-if="result && !req.loading.value" class="badge ok">{{ Math.round(result.reductionRatio * 100) }}% shorter</span>
          </div>
          <div v-if="result" class="row">
            <button class="btn btn-ghost btn-sm btn-icon" type="button" title="Copy" @click="copyText(result.summary)"><Copy /></button>
            <ExportMenu :text="result.summary" title="Summary" />
          </div>
        </div>
        <div class="pane-body">
          <template v-if="req.loading.value">
            <div v-if="live.text.value" class="output-text streaming">{{ live.visible.value }}</div>
            <StatusBits v-else kind="loading" :message="live.status.value || 'Summarizing…'" />
          </template>
          <template v-else-if="result">
            <ul v-if="result.format === 'bullet' && result.keyPoints?.length" class="output-text" style="padding-left: 20px; margin: 0; display: grid; gap: 8px">
              <li v-for="(p, i) in result.keyPoints" :key="i">{{ p }}</li>
            </ul>
            <div v-else class="output-text">{{ result.summary }}</div>
          </template>
          <StatusBits v-else kind="empty" message="Your summary will appear here.">
            <template #icon><FileText /></template>
          </StatusBits>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Copy, FileText, Square } from 'lucide-vue-next';
import EditorPane from '../components/EditorPane.vue';
import StatusBits from '../components/StatusBits.vue';
import ExportMenu from '../components/ExportMenu.vue';
import { api, type SummarizeResult } from '../api';
import { useRequest } from '../composables/useRequest';
import { useLiveText } from '../composables/useLiveText';
import { copyText, useToolInput } from '../store';
import { addHistory } from '../lib/db';

const lengths = ['short', 'medium', 'long'] as const;
const sample = 'Artificial intelligence has evolved from symbolic expert systems to statistical deep learning. Large foundation models trained on web-scale data now show strong abilities in reasoning, writing and translation. As a result, organizations in law, healthcare and education are reshaping their workflows to include generative AI, while regulators debate standards for transparency, privacy and accountability.';

const input = useToolInput('summarize', sample);
const format = ref<'bullet' | 'paragraph'>('bullet');
const length = ref<(typeof lengths)[number]>('medium');
const result = ref<SummarizeResult | null>(null);
const req = useRequest();
const live = useLiveText();

async function run() {
  if (!input.value.trim() || req.loading.value) return;
  live.reset();
  const text = input.value;
  const r = await req.run(signal =>
    api.summarize(text, format.value, length.value, { signal, onDelta: live.append, onStatus: m => (live.status.value = m) })
  );
  if (r) {
    result.value = r;
    addHistory({ tool: 'summarize', label: `Summary · ${length.value}`, input: text, output: r.summary });
  }
}
</script>
