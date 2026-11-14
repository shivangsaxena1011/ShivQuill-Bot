<template>
  <div class="stack">
    <div v-if="kind === 'suggestions'" class="card toolbar">
      <div class="chip-row">
        <button v-for="f in focuses" :key="f.id" type="button" class="chip" :class="{ active: focus === f.id }" @click="focus = f.id">{{ f.label }}</button>
      </div>
    </div>

    <StatusBits kind="error" :message="req.error.value" @dismiss="req.error.value = ''" />

    <div class="split-side">
      <EditorPane
        ref="editor"
        v-model="input"
        :tool="kind"
        :title="kind === 'grammar' ? 'Text to proofread' : 'Text to improve'"
        :placeholder="kind === 'grammar' ? 'Paste text to check grammar, spelling and punctuation…' : 'Paste text to get clarity, tone and conciseness suggestions…'"
        @submit="run"
      >
        <template #head>
          <button class="btn btn-ghost btn-sm" type="button" @click="input = sample">Sample</button>
        </template>
        <template #foot>
          <button v-if="req.loading.value" class="btn btn-danger btn-sm" type="button" @click="req.cancel()"><Square /> Stop</button>
          <button class="btn btn-primary" type="button" :disabled="req.loading.value || !input.trim()" @click="run">
            <component :is="kind === 'grammar' ? SpellCheck : Lightbulb" />
            {{ kind === 'grammar' ? 'Check text' : 'Get suggestions' }}
          </button>
        </template>
      </EditorPane>

      <div class="card pane">
        <div class="pane-head">
          <div class="row">
            <span class="pane-title">{{ kind === 'grammar' ? 'Issues' : 'Suggestions' }}</span>
            <span v-if="items" class="badge brand">{{ items.length }}</span>
          </div>
          <button v-if="items && applicableCount > 0" class="btn btn-sm btn-primary" type="button" @click="applyAll">
            <Check /> Apply all ({{ applicableCount }})
          </button>
        </div>
        <div class="pane-body">
          <StatusBits v-if="req.loading.value" kind="loading" :message="kind === 'grammar' ? 'Proofreading…' : 'Reviewing your writing…'" />
          <template v-else-if="items">
            <p v-if="summary" class="alert info small" style="margin-bottom: 12px">{{ summary }}</p>
            <div v-if="items.length" class="review-list">
              <div
                v-for="item in items"
                :key="item.id"
                class="review-card"
                :class="{ unlocated: !isApplicable(item) }"
              >
                <div class="spread">
                  <span class="badge" :class="badgeClass(item.label)">{{ item.label }}</span>
                  <div class="row">
                    <button class="btn btn-ghost btn-sm" type="button" @click="dismiss(item)">Dismiss</button>
                    <button class="btn btn-sm" type="button" :disabled="!isApplicable(item)" :title="isApplicable(item) ? '' : 'This text was not found — it may have been edited'" @click="accept(item)">Apply</button>
                  </div>
                </div>
                <div class="review-change" style="cursor: pointer" title="Show in text" role="button" tabindex="0" @click="preview(item)" @keydown.enter.prevent="preview(item)" @keydown.space.prevent="preview(item)">
                  <span class="from">{{ item.original }}</span>
                  <span class="faint">→</span>
                  <span class="to">{{ item.replacement || '(remove)' }}</span>
                </div>
                <p>{{ item.explanation }}</p>
              </div>
            </div>
            <StatusBits v-else kind="empty" :message="kind === 'grammar' ? 'No issues found. Nice work!' : 'No suggestions — your writing reads well.'">
              <template #icon><Check /></template>
            </StatusBits>
          </template>
          <StatusBits v-else kind="empty" :message="kind === 'grammar' ? 'Issues will be listed here. Click one to find it in your text.' : 'Suggestions will be listed here. Click one to find it in your text.'">
            <template #icon><component :is="kind === 'grammar' ? SpellCheck : Lightbulb" /></template>
          </StatusBits>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, Lightbulb, SpellCheck, Square } from 'lucide-vue-next';
import EditorPane from '../components/EditorPane.vue';
import StatusBits from '../components/StatusBits.vue';
import { api } from '../api';
import { useRequest } from '../composables/useRequest';
import { showToast, useToolInput } from '../store';
import { addHistory } from '../lib/db';
import { applyAllEdits, applyEdit, locateEdit, type OffsetEdit } from '../lib/text';

const props = defineProps<{ kind: 'grammar' | 'suggestions' }>();

interface Item extends OffsetEdit {
  label: string;
  explanation: string;
}

const focuses = [
  { id: 'all', label: 'Everything' },
  { id: 'clarity', label: 'Clarity' },
  { id: 'conciseness', label: 'Conciseness' },
  { id: 'vocabulary', label: 'Vocabulary' },
  { id: 'tone', label: 'Tone' },
  { id: 'academic', label: 'Academic' }
];

const sample = props.kind === 'grammar'
  ? 'Teh results of the experiment was completely unexpected, because nobody checked teh calibration before they starts.'
  : 'In order to achieve our quarterly targets, it is very important that we utilize modern engineering pipelines due to the fact that they are faster.';

const input = useToolInput(props.kind, sample);
const focus = ref('all');
const items = ref<Item[] | null>(null);
const summary = ref('');
const editor = ref<InstanceType<typeof EditorPane> | null>(null);
const req = useRequest();

const isApplicable = (item: Item) => locateEdit(input.value, item) !== -1;
const applicableCount = computed(() => (items.value || []).filter(isApplicable).length);

function badgeClass(label: string) {
  return { spelling: 'bad', grammar: 'bad', punctuation: 'warn', style: 'brand' }[label] || 'brand';
}

async function run() {
  if (!input.value.trim() || req.loading.value) return;
  const text = input.value;
  const res = await req.run(async signal => {
    if (props.kind === 'grammar') {
      const r = await api.grammar(text, { signal });
      return {
        summary: '',
        items: r.issues.map(i => ({ id: i.id, start: i.start, end: i.end, original: i.original, replacement: i.replacement, located: i.located, label: i.category, explanation: i.explanation }))
      };
    }
    const r = await api.suggestions(text, focus.value, { signal });
    return {
      summary: r.editorialSummary || '',
      items: r.suggestions.map(s => ({ id: s.id, start: s.start, end: s.end, original: s.originalText, replacement: s.suggestedText, located: s.located, label: s.type, explanation: s.explanation }))
    };
  });
  if (res) {
    // Drop no-op items (model sometimes "corrects" text to itself)
    items.value = res.items.filter(i => i.original !== i.replacement);
    summary.value = res.summary;
    addHistory({
      tool: props.kind,
      label: props.kind === 'grammar' ? `Grammar · ${items.value.length} issues` : `Suggestions · ${items.value.length}`,
      input: text,
      output: items.value.map(i => `${i.original} → ${i.replacement}: ${i.explanation}`).join('\n')
    });
  }
}

function preview(item: Item) {
  const at = locateEdit(input.value, item);
  if (at !== -1) editor.value?.select(at, at + item.original.length);
}

function accept(item: Item) {
  if (!items.value) return;
  const r = applyEdit(input.value, item, items.value);
  input.value = r.text;
  items.value = r.remaining;
  if (!r.applied) showToast('That text has changed — skipped');
}

function dismiss(item: Item) {
  if (items.value) items.value = items.value.filter(i => i.id !== item.id);
}

function applyAll() {
  if (!items.value) return;
  const r = applyAllEdits(input.value, items.value);
  input.value = r.text;
  items.value = items.value.filter(i => !r.appliedIds.has(i.id));
  showToast(`Applied ${r.appliedIds.size} change${r.appliedIds.size === 1 ? '' : 's'}`);
}
</script>
