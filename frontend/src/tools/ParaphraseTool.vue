<template>
  <div class="stack">
    <div class="card toolbar">
      <div class="chip-row" role="radiogroup" aria-label="Paraphrase mode">
        <button
          v-for="m in modes"
          :key="m.id"
          type="button"
          class="chip"
          :class="{ active: compare ? compareModes.includes(m.id) : mode === m.id }"
          :title="m.hint"
          @click="pickMode(m.id)"
        >{{ m.label }}</button>
      </div>
      <div class="row-wrap small muted">
        <label class="row" title="Run up to 3 modes side by side">
          <input v-model="compare" type="checkbox" /> Compare
        </label>
        <span>Changes</span>
        <input v-model.number="strength" type="range" min="1" max="4" step="1" aria-label="Amount of change" />
        <span class="badge brand">{{ strengthLabels[strength - 1] }}</span>
      </div>
    </div>

    <div class="card card-pad stack" style="gap: 10px">
      <div v-if="mode === 'custom' && !compare" class="stack" style="gap: 8px">
        <div class="row-wrap">
          <input v-model="customInstruction" class="input grow" maxlength="2000" placeholder="Describe the style, e.g. friendly product announcement with short sentences" aria-label="Custom style instructions" />
          <select v-if="presets.length" class="select" style="width: 180px" aria-label="Saved presets" @change="usePreset(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
            <option value="">Saved presets…</option>
            <option v-for="p in presets" :key="p.name" :value="p.name">{{ p.name }}</option>
          </select>
          <button class="btn btn-sm" type="button" :disabled="!customInstruction.trim()" @click="savePreset"><BookmarkPlus /> Save preset</button>
        </div>
        <div v-if="presets.length" class="chip-row">
          <span v-for="p in presets" :key="p.name" class="tag">
            <button type="button" class="tag-link" :title="p.instruction" @click="usePreset(p.name)">{{ p.name }}</button>
            <button type="button" :aria-label="`Delete preset ${p.name}`" @click="deletePreset(p.name)"><X :size="12" /></button>
          </span>
        </div>
      </div>
      <div class="row-wrap">
        <span class="small muted" style="white-space: nowrap" title="These words and phrases will be kept exactly as written">Keep unchanged:</span>
        <TagInput v-model="frozenWords" class="grow" placeholder="Add words or names to keep, e.g. ShivQuill, Fortune 500" />
      </div>
    </div>

    <StatusBits kind="error" :message="req.error.value" @dismiss="req.error.value = ''" />

    <div v-if="rephrase.open" class="card card-pad stack" style="gap: 8px">
      <div class="spread">
        <strong class="small">Rephrase: <span class="muted">“{{ rephrase.sentence.length > 90 ? rephrase.sentence.slice(0, 90) + '…' : rephrase.sentence }}”</span></strong>
        <button class="btn btn-ghost btn-sm btn-icon" type="button" aria-label="Close" @click="rephrase.open = false"><X /></button>
      </div>
      <StatusBits v-if="rephraseReq.loading.value" kind="loading" message="Finding alternatives…" />
      <StatusBits kind="error" :message="rephraseReq.error.value" @dismiss="rephraseReq.error.value = ''" />
      <button v-for="(alt, i) in rephrase.alternatives" :key="i" class="alt-option" type="button" @click="applyAlternative(alt)">{{ alt }}</button>
    </div>

    <div class="split">
      <EditorPane ref="editor" v-model="input" tool="paraphrase" title="Original" placeholder="Paste text to paraphrase (up to 1,000,000 characters)…" @submit="run">
        <template #head>
          <button class="btn btn-ghost btn-sm" type="button" title="Select a sentence first" @click="rephraseSelection"><WandSparkles /> Rephrase selection</button>
        </template>
        <template #foot>
          <button v-if="busy" class="btn btn-danger btn-sm" type="button" @click="stopAll"><Square /> Stop</button>
          <button class="btn btn-primary" type="button" :disabled="busy || !input.trim()" @click="run">
            <PenLine /> {{ compare ? 'Compare' : 'Paraphrase' }}
          </button>
        </template>
      </EditorPane>

      <div v-if="compare" class="card pane">
        <div class="pane-head"><span class="pane-title">Comparison</span><span class="faint tiny">Pick up to 3 modes · max {{ COMPARE_LIMIT.toLocaleString() }} chars</span></div>
        <div class="pane-body compare-grid">
          <div v-for="c in comparisons" :key="c.mode" class="compare-col">
            <div class="spread"><span class="badge brand">{{ modeLabel(c.mode) }}</span>
              <div class="row">
                <button v-if="c.result" class="btn btn-ghost btn-sm btn-icon" type="button" title="Copy" @click="copyText(c.result.paraphrasedText)"><Copy /></button>
                <button v-if="c.result" class="btn btn-sm" type="button" @click="useComparison(c)">Use</button>
              </div>
            </div>
            <StatusBits v-if="c.loading" kind="loading" message="Rewriting…" />
            <p v-else-if="c.error" class="small" style="color: var(--bad)">{{ c.error }}</p>
            <div v-else-if="c.result" class="output-text small">{{ c.result.paraphrasedText }}</div>
          </div>
          <StatusBits v-if="!comparisons.length" kind="empty" message="Choose 2–3 modes above, then press Compare.">
            <template #icon><Columns3 /></template>
          </StatusBits>
        </div>
      </div>

      <div v-else class="card pane">
        <div class="pane-head">
          <div class="row">
            <span class="pane-title">Rewritten</span>
            <span v-if="result?.semanticConsistency && result.semanticConsistency.totalCount > 0" class="badge" :class="result.semanticConsistency.preservationRate >= 90 ? 'ok' : 'warn'" :title="result.semanticConsistency.notes">
              {{ result.semanticConsistency.preservationRate }}% facts kept
            </span>
            <span v-if="result?.partialRecovery" class="badge warn" title="Some parts could not be rewritten and were kept as-is">Partly rewritten</span>
            <span v-if="edited" class="badge" title="Highlights show the original rewrite; your edits are in the Edit tab">Edited</span>
          </div>
          <div v-if="result" class="row">
            <div class="tabs">
              <button class="tab" :class="{ active: view === 'changes' }" type="button" @click="view = 'changes'">Changes</button>
              <button class="tab" :class="{ active: view === 'edit' }" type="button" @click="view = 'edit'">Edit</button>
            </div>
            <button class="btn btn-ghost btn-sm btn-icon" type="button" title="Copy" @click="copyText(output)"><Copy /></button>
            <ExportMenu :text="output" title="Paraphrased text" />
          </div>
        </div>
        <div class="pane-body">
          <StatusBits v-if="req.loading.value" kind="loading" :message="progressText" :progress="progress?.progressPercent">
            <p v-if="progress?.latestText" class="live-preview">{{ progress.latestText }}</p>
          </StatusBits>
          <template v-else-if="result">
            <div v-if="result.frozenWordsMissing?.length" class="alert warn small" style="margin-bottom: 10px">
              <CircleAlert /> <span>These kept words were changed anyway: {{ result.frozenWordsMissing.join(', ') }}</span>
            </div>
            <DiffView v-if="view === 'changes'" :diff-spans="result.diffSpans" interactive @update:text="onSwap" />
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
import { computed, reactive, ref } from 'vue';
import { BookmarkPlus, CircleAlert, Columns3, Copy, PenLine, Square, WandSparkles, X } from 'lucide-vue-next';
import EditorPane from '../components/EditorPane.vue';
import DiffView from '../components/DiffView.vue';
import StatusBits from '../components/StatusBits.vue';
import ExportMenu from '../components/ExportMenu.vue';
import TagInput from '../components/TagInput.vue';
import { api, errorMessage, isCancel, type JobProgress, type ParaphraseMode, type ParaphraseResult } from '../api';
import { useRequest } from '../composables/useRequest';
import { copyText, persistedJson, showToast, useToolInput } from '../store';
import { wordCount, formatNumber } from '../lib/text';
import { addHistory } from '../lib/db';

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
const modeLabel = (id: string) => modes.find(m => m.id === id)?.label || id;
const strengthLabels = ['Light', 'Balanced', 'Strong', 'Maximum'];
const sample = 'The industry is booming and we are getting close to achieving Fortune 500 status, as there are more requests to research new customers.\n\nIn 2026, our team reported that 95.5% of clients renewed their contracts (Smith et al., 2025).';

const input = useToolInput('paraphrase', sample);
const mode = ref<ParaphraseMode>('standard');
const strength = ref(2);
const customInstruction = ref('');
const frozenWords = persistedJson<string[]>('frozenWords', []);
const presets = persistedJson<{ name: string; instruction: string }[]>('presets', []);
const view = ref<'changes' | 'edit'>('changes');
const editor = ref<InstanceType<typeof EditorPane> | null>(null);

const result = ref<ParaphraseResult | null>(null);
const output = ref('');
const swapped = ref('');
const progress = ref<JobProgress | null>(null);
const req = useRequest();

const edited = computed(() => !!result.value && view.value === 'edit' && output.value !== (swapped.value || result.value.paraphrasedText));
const progressText = computed(() => {
  const p = progress.value;
  if (!p || p.totalChunks <= 1) return 'Rewriting…';
  return `Rewriting part ${Math.min(p.completedChunks + p.failedChunks + 1, p.totalChunks)} of ${p.totalChunks}…`;
});

function onSwap(text: string) {
  output.value = text;
  swapped.value = text;
}

// ---------------- Presets ----------------
function savePreset() {
  const instruction = customInstruction.value.trim();
  if (!instruction) return;
  const name = window.prompt('Name this preset:', instruction.slice(0, 30));
  if (!name?.trim()) return;
  presets.value = [...presets.value.filter(p => p.name !== name.trim()), { name: name.trim(), instruction }].slice(-20);
  showToast('Preset saved');
}
function usePreset(name: string) {
  const p = presets.value.find(x => x.name === name);
  if (p) customInstruction.value = p.instruction;
}
function deletePreset(name: string) {
  presets.value = presets.value.filter(p => p.name !== name);
}

// ---------------- Jobs ----------------
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(Object.assign(new Error('canceled'), { name: 'CanceledError' }));
    }, { once: true });
  });

async function runJob(m: ParaphraseMode, signal: AbortSignal, onProgress?: (p: JobProgress) => void, onJob?: (id: string) => void) {
  const job = await api.startParaphrase({
    text: input.value,
    mode: m,
    synonymStrength: strength.value,
    customInstruction: m === 'custom' ? customInstruction.value || undefined : undefined,
    frozenWords: frozenWords.value.length ? frozenWords.value : undefined
  }, { signal });
  onJob?.(job.jobId);
  const cancel = () => api.cancelJob(job.jobId).catch(() => undefined);
  signal.addEventListener('abort', cancel, { once: true });

  let delay = 400;
  for (;;) {
    await wait(delay, signal);
    const p = await api.jobProgress(job.jobId, { signal });
    onProgress?.(p);
    if (p.status === 'completed' && p.result) return p.result;
    if (p.status === 'failed') throw new Error(p.errorMessage || 'Paraphrasing failed.');
    if (p.status === 'cancelled') throw Object.assign(new Error('canceled'), { name: 'CanceledError' });
    delay = Math.min(1500, delay + 200);
  }
}

async function runSingle() {
  progress.value = null;
  const final = await req.run(signal => runJob(mode.value, signal, p => (progress.value = p)));
  if (final) {
    result.value = final;
    output.value = final.paraphrasedText;
    swapped.value = '';
    view.value = 'changes';
    addHistory({ tool: 'paraphrase', label: `Paraphrase · ${modeLabel(mode.value)}`, input: input.value, output: final.paraphrasedText });
  }
}

// ---------------- Compare ----------------
const COMPARE_LIMIT = 5000;
const compare = ref(false);
const compareModes = ref<ParaphraseMode[]>(['standard', 'formal', 'simple']);
interface Comparison { mode: ParaphraseMode; loading: boolean; error: string; result: ParaphraseResult | null }
const comparisons = ref<Comparison[]>([]);
let compareController: AbortController | null = null;
const comparing = computed(() => comparisons.value.some(c => c.loading));
const busy = computed(() => req.loading.value || comparing.value);

function pickMode(id: ParaphraseMode) {
  if (!compare.value) {
    mode.value = id;
    return;
  }
  if (compareModes.value.includes(id)) compareModes.value = compareModes.value.filter(m => m !== id);
  else if (compareModes.value.length < 3) compareModes.value = [...compareModes.value, id];
  else showToast('Compare up to 3 modes at a time');
}

async function runCompare() {
  if (compareModes.value.length < 2) {
    showToast('Pick at least 2 modes to compare');
    return;
  }
  if (input.value.length > COMPARE_LIMIT) {
    showToast(`Compare works on up to ${COMPARE_LIMIT.toLocaleString()} characters — select a shorter passage`);
    return;
  }
  compareController?.abort();
  compareController = new AbortController();
  const signal = compareController.signal;
  comparisons.value = compareModes.value.map(m => reactive({ mode: m, loading: true, error: '', result: null }) as Comparison);
  await Promise.all(comparisons.value.map(async c => {
    try {
      c.result = await runJob(c.mode, signal);
    } catch (err) {
      if (!isCancel(err)) c.error = errorMessage(err);
    } finally {
      c.loading = false;
    }
  }));
}

function useComparison(c: Comparison) {
  if (!c.result) return;
  compare.value = false;
  mode.value = c.mode;
  result.value = c.result;
  output.value = c.result.paraphrasedText;
  swapped.value = '';
  view.value = 'changes';
}

function stopAll() {
  req.cancel();
  compareController?.abort();
  comparisons.value.forEach(c => (c.loading = false));
}

function run() {
  if (!input.value.trim() || busy.value) return;
  return compare.value ? runCompare() : runSingle();
}

// ---------------- Rephrase a selected sentence ----------------
const rephrase = reactive({ open: false, sentence: '', start: 0, end: 0, alternatives: [] as string[] });
const rephraseReq = useRequest();

async function rephraseSelection() {
  const sel = editor.value?.getSelection();
  if (!sel || !sel.text.trim()) {
    showToast('Select a sentence in the Original text first');
    return;
  }
  if (sel.text.length > 1500) {
    showToast('Select a shorter passage (up to 1,500 characters)');
    return;
  }
  Object.assign(rephrase, { open: true, sentence: sel.text, start: sel.start, end: sel.end, alternatives: [] });
  const context = input.value.slice(Math.max(0, sel.start - 600), Math.min(input.value.length, sel.end + 600));
  const r = await rephraseReq.run(signal => api.rephraseSentence({
    sentence: sel.text,
    context,
    mode: mode.value,
    count: 3,
    frozenWords: frozenWords.value.length ? frozenWords.value : undefined
  }, { signal }));
  if (r) rephrase.alternatives = r.alternatives;
}

function applyAlternative(alt: string) {
  // The text may have changed since selecting; find the sentence again if needed
  let start = rephrase.start;
  if (input.value.slice(start, rephrase.end) !== rephrase.sentence) {
    start = input.value.indexOf(rephrase.sentence);
    if (start === -1) {
      showToast('That sentence has changed — select it again');
      return;
    }
  }
  // Keep the selection's surrounding whitespace
  const lead = rephrase.sentence.match(/^\s*/)![0];
  const trail = rephrase.sentence.match(/\s*$/)![0];
  editor.value?.replaceRange(start, start + rephrase.sentence.length, `${lead}${alt}${trail}`);
  rephrase.open = false;
}
</script>
