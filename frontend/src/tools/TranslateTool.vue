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
      <span v-if="result" class="badge">Detected: {{ result.detectedSourceLang }}</span>
    </div>

    <StatusBits kind="error" :message="req.error.value" @dismiss="req.error.value = ''" />

    <div class="split">
      <EditorPane v-model="input" title="Source text" placeholder="Type or paste text to translate…" @submit="run">
        <template #foot>
          <button v-if="req.loading.value" class="btn btn-danger btn-sm" type="button" @click="req.cancel()"><Square /> Stop</button>
          <button class="btn btn-primary" type="button" :disabled="req.loading.value || !input.trim()" @click="run"><Languages /> Translate</button>
        </template>
      </EditorPane>

      <div class="card pane">
        <div class="pane-head">
          <span class="pane-title">{{ targetName }}</span>
          <button v-if="result" class="btn btn-ghost btn-sm btn-icon" type="button" title="Copy" @click="copyText(result.translatedText)"><Copy /></button>
        </div>
        <div class="pane-body">
          <StatusBits v-if="req.loading.value" kind="loading" message="Translating…" />
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
import { ArrowLeftRight, Copy, Languages, Square } from 'lucide-vue-next';
import EditorPane from '../components/EditorPane.vue';
import StatusBits from '../components/StatusBits.vue';
import { api, type TranslateResult } from '../api';
import { useRequest } from '../composables/useRequest';
import { copyText, persisted, shareToolText } from '../store';

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

const input = persisted('translate', 'Welcome to ShivQuill, a writing assistant that helps you write clearly and confidently.');
shareToolText('translate', input);
const source = ref('auto');
const target = ref('es');
const result = ref<TranslateResult | null>(null);
const req = useRequest();

const targetName = computed(() => languages.value.find(l => l.code === target.value)?.name || 'Translation');
const rtl = computed(() => ['ar', 'he', 'fa', 'ur'].includes(result.value?.targetLang || ''));

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
  const r = await req.run(signal => api.translate(input.value, source.value, target.value, { signal }));
  if (r) result.value = r;
}
</script>
