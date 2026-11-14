<template>
  <div class="stack">
    <div class="card toolbar">
      <div class="chip-row" role="radiogroup" aria-label="Paraphrase mode">
        <button
          v-for="m in modes"
          :key="m.id"
          type="button"
          class="chip"
          :class="{ active: mode === m.id }"
          :title="m.hint"
          @click="mode = m.id"
        >{{ m.label }}</button>
      </div>
      <div class="row small muted">
        <span>Changes</span>
        <input v-model.number="strength" type="range" min="1" max="4" step="1" aria-label="Amount of change" />
        <span class="badge brand">{{ strengthLabels[strength - 1] }}</span>
      </div>
    </div>

    <div v-if="mode === 'custom'" class="card card-pad">
      <label class="field">
        Describe the style you want
        <input v-model="customInstruction" class="input" maxlength="2000" placeholder="e.g. friendly product announcement, short sentences" />
      </label>
    </div>

    <StatusBits kind="error" :message="req.error.value" @dismiss="req.error.value = ''" />

    <div class="split">
      <EditorPane v-model="input" title="Original" placeholder="Paste text to paraphrase (up to 1,000,000 characters)…" @submit="run">
        <template #head>
          <button class="btn btn-ghost btn-sm" type="button" @click="input = sample">Sample</button>
        </template>
        <template #foot>
          <button v-if="req.loading.value" class="btn btn-danger btn-sm" type="button" @click="req.cancel()"><Square /> Stop</button>
          <button class="btn btn-primary" type="button" :disabled="req.loading.value || !input.trim()" @click="run">
            <PenLine /> Paraphrase
          </button>
        </template>
      </EditorPane>

      <div class="card pane">
        <div class="pane-head">
          <div class="row">
            <span class="pane-title">Rewritten</span>
            <span v-if="result?.semanticConsistency && result.semanticConsistency.totalCount > 0" class="badge" :class="result.semanticConsistency.preservationRate >= 90 ? 'ok' : 'warn'" :title="result.semanticConsistency.notes">
              {{ result.semanticConsistency.preservationRate }}% facts kept
            </span>
            <span v-if="result?.partialRecovery" class="badge warn" title="Some parts could not be rewritten and were kept as-is">Partly rewritten</span>
          </div>
          <div v-if="result" class="row">
            <div class="tabs">
              <button class="tab" :class="{ active: view === 'changes' }" type="button" @click="view = 'changes'">Changes</button>
              <button class="tab" :class="{ active: view === 'edit' }" type="button" @click="view = 'edit'">Edit</button>
            </div>
            <button class="btn btn-ghost btn-sm btn-icon" type="button" title="Copy" @click="copyText(output)"><Copy /></button>
          </div>
        </div>
        <div class="pane-body">
          <StatusBits v-if="req.loading.value" kind="loading" :message="progressText" :progress="progress?.progressPercent" />
          <template v-else-if="result">
            <DiffView v-if="view === 'changes'" :diff-spans="result.diffSpans" interactive @update:text="output = $event" />
            <textarea v-else v-model="output" class="editor" style="padding: 0; height: 100%" aria-label="Edit rewritten text"></textarea>
          </template>
          <StatusBits v-else kind="empty" message="Your rewritten text will appear here, with changes highlighted.">
            <template #icon><PenLine /></template>
          </StatusBits>
        </div>
        <div class="pane-foot">
          <span>{{ result ? `${formatNumber(wordCount(output))} words` : '' }}</span>
          <div v-if="result && view === 'changes'" class="legend">
            <span><i style="background: var(--hl-synonym)"></i>Changed (click to swap)</span>
            <span><i style="background: var(--hl-added)"></i>Added</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { PenLine, Square, Copy } from 'lucide-vue-next';
import EditorPane from '../components/EditorPane.vue';
import DiffView from '../components/DiffView.vue';
import StatusBits from '../components/StatusBits.vue';
import { api, type JobProgress, type ParaphraseMode, type ParaphraseResult } from '../api';
import { useRequest } from '../composables/useRequest';
import { copyText, persisted, shareToolText } from '../store';
import { wordCount, formatNumber } from '../lib/text';

const modes: { id: ParaphraseMode; label: string; hint: string }[] = [
  { id: 'standard', label: 'Standard', hint: 'Clear, natural rewrite' },
  { id: 'fluency', label: 'Fluency', hint: 'Fix awkward phrasing, keep wording' },
  { id: 'formal', label: 'Formal', hint: 'Professional register' },
  { id: 'academic', label: 'Academic', hint: 'Scholarly tone, citations kept' },
  { id: 'simple', label: 'Simple', hint: 'Plain English' },
  { id: 'creative', label: 'Creative', hint: 'Vivid, varied style' },
  { id: 'expand', label: 'Expand', hint: 'Add detail' },
  { id: 'shorten', label: 'Shorten', hint: 'Make it concise' },
  { id: 'custom', label: 'Custom', hint: 'Your own instructions' }
];
const strengthLabels = ['Light', 'Balanced', 'Strong', 'Maximum'];
const sample = 'The industry is booming and we are getting close to achieving Fortune 500 status, as there are more requests to research new customers.\n\nIn 2026, our team reported that 95.5% of clients renewed their contracts (Smith et al., 2025).';

const input = persisted('paraphrase', sample);
shareToolText('paraphrase', input);
const mode = ref<ParaphraseMode>('standard');
const strength = ref(2);
const customInstruction = ref('');
const view = ref<'changes' | 'edit'>('changes');

const result = ref<ParaphraseResult | null>(null);
const output = ref('');
const progress = ref<JobProgress | null>(null);
const req = useRequest();

const progressText = computed(() => {
  const p = progress.value;
  if (!p || p.totalChunks <= 1) return 'Rewriting…';
  return `Rewriting part ${Math.min(p.completedChunks + p.failedChunks + 1, p.totalChunks)} of ${p.totalChunks}…`;
});

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(Object.assign(new Error('canceled'), { name: 'CanceledError' }));
    }, { once: true });
  });

async function run() {
  if (!input.value.trim() || req.loading.value) return;
  progress.value = null;
  const final = await req.run(async signal => {
    const job = await api.startParaphrase({
      text: input.value,
      mode: mode.value,
      synonymStrength: strength.value,
      customInstruction: mode.value === 'custom' ? customInstruction.value || undefined : undefined
    }, { signal });
    // Stopping must also stop the server-side job, or it keeps spending AI calls
    req.setCancelHook(() => api.cancelJob(job.jobId).catch(() => undefined));

    let delay = 400;
    for (;;) {
      await wait(delay, signal);
      const p = await api.jobProgress(job.jobId, { signal });
      progress.value = p;
      if (p.status === 'completed' && p.result) return p.result;
      if (p.status === 'failed') throw new Error(p.errorMessage || 'Paraphrasing failed.');
      if (p.status === 'cancelled') throw Object.assign(new Error('canceled'), { name: 'CanceledError' });
      delay = Math.min(1500, delay + 200);
    }
  });
  if (final) {
    result.value = final;
    output.value = final.paraphrasedText;
    view.value = 'changes';
  }
}
</script>
