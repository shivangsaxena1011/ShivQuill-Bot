<template>
  <div class="stack">
    <div class="card toolbar">
      <div class="row-wrap">
        <select v-model="source" class="select" style="width: 190px" aria-label="Source language">
          <option value="auto">Detect language</option>
          <option v-for="l in languages" :key="l.code" :value="l.code">{{ l.name }}</option>
        </select>
        <button class="btn btn-ghost btn-icon" type="button" :disabled="source === 'auto'" :title="source === 'auto' ? 'Pick a source language to swap' : 'Swap languages'" @click="swap"><ArrowLeftRight /></button>
        <select v-model="target" class="select" style="width: 190px" aria-label="Target language">
          <option v-for="l in languages" :key="l.code" :value="l.code">{{ l.name }}</option>
        </select>
      </div>
      <div class="row">
        <span v-if="result && !req.loading.value" class="badge">Detected: {{ result.detectedSourceLang }}</span>
        <button class="btn btn-sm" type="button" :class="{ 'btn-primary': showGlossary }" @click="showGlossary = !showGlossary">
          <BookA /> Glossary<span v-if="glossary.length"> ({{ glossary.length }})</span>
        </button>
      </div>
    </div>

    <div v-if="showGlossary" class="card card-pad stack" style="gap: 8px">
      <div class="spread">
        <span class="small muted">Terms that must always be translated a certain way (names, products, jargon). Saved in this browser.</span>
        <button v-if="glossary.length" class="btn btn-ghost btn-sm" type="button" @click="glossary = []">Clear all</button>
      </div>
      <div v-for="(g, i) in glossary" :key="i" class="row">
        <input v-model="g.source" class="input" placeholder="Term in source text" maxlength="100" aria-label="Source term" />
        <span class="faint">→</span>
        <input v-model="g.target" class="input" placeholder="Always translate as" maxlength="100" aria-label="Translation" />
        <button class="btn btn-ghost btn-icon btn-sm" type="button" aria-label="Remove term" @click="glossary.splice(i, 1)"><X /></button>
      </div>
      <div><button class="btn btn-sm" type="button" :disabled="glossary.length >= 100" @click="glossary.push({ source: '', target: '' })"><Plus /> Add term</button></div>
    </div>

    <StatusBits kind="error" :message="req.error.value" @dismiss="req.error.value = ''" />

    <div class="split">
      <EditorPane v-model="input" tool="translate" title="Source text" placeholder="Type or paste text to translate…" @submit="run">
        <template #foot>
          <button v-if="req.loading.value" class="btn btn-danger btn-sm" type="button" @click="req.cancel()"><Square /> Stop</button>
          <button class="btn btn-primary" type="button" :disabled="req.loading.value || !input.trim()" @click="run"><Languages /> Translate</button>
        </template>
      </EditorPane>

      <div class="card pane">
        <div class="pane-head">
          <span class="pane-title">{{ targetName }}</span>
          <div v-if="result" class="row">
            <button class="btn btn-ghost btn-sm btn-icon" type="button" title="Copy" @click="copyText(result.translatedText)"><Copy /></button>
            <ExportMenu :text="result.translatedText" :title="`Translation (${targetName})`" />
          </div>
        </div>
        <div class="pane-body">
          <template v-if="req.loading.value">
            <div v-if="live.text.value" class="output-text streaming" :dir="rtlTarget ? 'rtl' : 'auto'">{{ live.visible.value }}</div>
            <StatusBits v-else kind="loading" message="Translating…" />
          </template>
          <div v-else-if="result" class="output-text" :dir="rtl ? 'rtl' : 'auto'">{{ result.translatedText }}</div>
          <StatusBits v-else kind="empty" message="The translation will appear here.">
            <template #icon><Languages /></template>
          </StatusBits>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ArrowLeftRight, BookA, Copy, Languages, Plus, Square, X } from 'lucide-vue-next';
import EditorPane from '../components/EditorPane.vue';
import StatusBits from '../components/StatusBits.vue';
import ExportMenu from '../components/ExportMenu.vue';
import { api, type GlossaryEntry, type TranslateResult } from '../api';
import { useRequest } from '../composables/useRequest';
import { useLiveText } from '../composables/useLiveText';
import { copyText, persistedJson, useToolInput } from '../store';
import { addHistory } from '../lib/db';

const RTL = ['ar', 'he', 'fa', 'ur'];

// Fallback until the server list loads (the server is the source of truth)
const languages = ref<{ code: string; name: string }[]>([
  { code: 'en', name: 'English' }, { code: 'es', name: 'Spanish' }, { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' }, { code: 'hi', name: 'Hindi' }, { code: 'zh', name: 'Chinese (Simplified)' }
]);
onMounted(async () => {
  try {
    const list = await api.languages();
    languages.value = [...list].sort((a, b) => a.name.localeCompare(b.name));
  } catch { /* keep fallback */ }
});

const input = useToolInput('translate', 'Welcome to ShivQuill, a writing assistant that helps you write clearly and confidently.');
const source = ref('auto');
const target = ref('es');
const glossary = persistedJson<GlossaryEntry[]>('glossary', []);
const showGlossary = ref(false);
const result = ref<TranslateResult | null>(null);
const req = useRequest();
const live = useLiveText();

const targetName = computed(() => languages.value.find(l => l.code === target.value)?.name || 'Translation');
const rtl = computed(() => RTL.includes(result.value?.targetLang || ''));
const rtlTarget = computed(() => RTL.includes(target.value));

function swap() {
  if (source.value === 'auto') return;
  [source.value, target.value] = [target.value, source.value];
  if (result.value) {
    input.value = result.value.translatedText;
    result.value = null;
  }
}

async function run() {
  if (!input.value.trim() || req.loading.value) return;
  live.reset();
  const text = input.value;
  const terms = glossary.value
    .map(g => ({ source: g.source.trim(), target: g.target.trim() }))
    .filter(g => g.source && g.target);
  const r = await req.run(signal => api.translate(text, source.value, target.value, terms, { signal, onDelta: live.append }));
  if (r) {
    result.value = r;
    addHistory({ tool: 'translate', label: `Translate → ${targetName.value}`, input: text, output: r.translatedText });
  }
}
</script>
