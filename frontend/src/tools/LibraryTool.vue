<template>
  <div class="stack">
    <div class="card toolbar">
      <div class="tabs">
        <button class="tab" :class="{ active: tab === 'documents' }" type="button" @click="tab = 'documents'">Saved documents ({{ documents.length }})</button>
        <button class="tab" :class="{ active: tab === 'history' }" type="button" @click="tab = 'history'">History ({{ history.length }})</button>
      </div>
      <div class="row">
        <input v-model="query" class="input" style="width: 220px" placeholder="Search…" aria-label="Search library" />
        <button v-if="tab === 'history' && history.length" class="btn btn-ghost btn-sm" type="button" @click="clearAll">Clear history</button>
      </div>
    </div>
    <p class="tiny faint">Stored only in this browser. Clearing your browser data removes it.</p>

    <div v-if="loading" class="card card-pad"><StatusBits kind="loading" message="Loading…" /></div>

    <template v-else-if="tab === 'documents'">
      <div v-if="filteredDocs.length" class="library-grid">
        <div v-for="d in filteredDocs" :key="d.id" class="card card-pad library-item">
          <div class="spread">
            <strong class="small library-title">{{ d.title }}</strong>
            <span class="tiny faint">{{ when(d.updatedAt) }}</span>
          </div>
          <p class="small muted library-snippet">{{ d.text.slice(0, 220) }}</p>
          <div class="row-wrap">
            <select class="select" style="width: auto; height: 30px; font-size: 13px" aria-label="Open in tool" @change="openDoc(d.text, ($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
              <option value="">Open in…</option>
              <option v-for="t in openTargets" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
            <button class="btn btn-ghost btn-sm btn-icon" type="button" title="Copy" @click="copyText(d.text)"><Copy /></button>
            <ExportMenu :text="d.text" :title="d.title" />
            <button class="btn btn-ghost btn-sm btn-icon" type="button" title="Delete" @click="removeDoc(d.id)"><Trash2 /></button>
          </div>
        </div>
      </div>
      <div v-else class="card card-pad">
        <StatusBits kind="empty" :message="query ? 'No documents match your search.' : 'No saved documents yet. Use the bookmark button above any editor to save your text here.'">
          <template #icon><Library /></template>
        </StatusBits>
      </div>
    </template>

    <template v-else>
      <div v-if="filteredHistory.length" class="stack" style="gap: 8px">
        <div v-for="h in filteredHistory" :key="h.id" class="card card-pad library-item">
          <div class="spread">
            <span class="badge brand">{{ h.label }}</span>
            <span class="tiny faint">{{ when(h.createdAt) }}</span>
          </div>
          <div class="history-io">
            <p class="small muted">{{ h.input.slice(0, 160) }}{{ h.input.length > 160 ? '…' : '' }}</p>
            <p class="small">{{ h.output.slice(0, 220) }}{{ h.output.length > 220 ? '…' : '' }}</p>
          </div>
          <div class="row-wrap">
            <button class="btn btn-sm" type="button" @click="openDoc(h.input, h.tool)">Reopen input</button>
            <button v-if="h.output" class="btn btn-ghost btn-sm" type="button" @click="copyText(h.output)"><Copy /> Copy result</button>
            <button class="btn btn-ghost btn-sm btn-icon" type="button" title="Delete" @click="removeHistory(h.id)"><Trash2 /></button>
          </div>
        </div>
      </div>
      <div v-else class="card card-pad">
        <StatusBits kind="empty" :message="query ? 'Nothing matches your search.' : 'Your recent results will appear here automatically.'">
          <template #icon><History /></template>
        </StatusBits>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, ref } from 'vue';
import { Copy, History, Library, Trash2 } from 'lucide-vue-next';
import StatusBits from '../components/StatusBits.vue';
import ExportMenu from '../components/ExportMenu.vue';
import { clearHistory, deleteDocument, deleteHistory, listDocuments, listHistory, type HistoryEntry, type SavedDocument } from '../lib/db';
import { copyText, openInTool, showToast, type ToolId } from '../store';

const tab = ref<'documents' | 'history'>('documents');
const query = ref('');
const documents = ref<SavedDocument[]>([]);
const history = ref<HistoryEntry[]>([]);
const loading = ref(true);

const openTargets: { id: ToolId; name: string }[] = [
  { id: 'paraphrase', name: 'Paraphraser' },
  { id: 'grammar', name: 'Grammar Checker' },
  { id: 'suggestions', name: 'Writing Suggestions' },
  { id: 'humanize', name: 'Humanizer' },
  { id: 'tone', name: 'Tone' },
  { id: 'summarize', name: 'Summarizer' },
  { id: 'translate', name: 'Translator' },
  { id: 'readability', name: 'Readability' },
  { id: 'detector', name: 'AI Pattern Check' },
  { id: 'plagiarism', name: 'Plagiarism Check' }
];

async function refresh() {
  const [d, h] = await Promise.all([listDocuments(), listHistory()]);
  documents.value = d;
  history.value = h;
  loading.value = false;
}
onMounted(refresh);
onActivated(refresh); // the page is kept alive; reload when revisited

const q = computed(() => query.value.trim().toLowerCase());
const filteredDocs = computed(() => (q.value ? documents.value.filter(d => `${d.title} ${d.text}`.toLowerCase().includes(q.value)) : documents.value));
const filteredHistory = computed(() => (q.value ? history.value.filter(h => `${h.label} ${h.input} ${h.output}`.toLowerCase().includes(q.value)) : history.value));

function openDoc(text: string, tool: string) {
  if (!tool) return;
  const target = openTargets.find(t => t.id === tool)?.id || 'paraphrase';
  openInTool(target, text);
}

async function removeDoc(id: string) {
  await deleteDocument(id);
  documents.value = documents.value.filter(d => d.id !== id);
}

async function removeHistory(id: string) {
  await deleteHistory(id);
  history.value = history.value.filter(h => h.id !== id);
}

async function clearAll() {
  if (!window.confirm('Delete all history in this browser? Saved documents are kept.')) return;
  await clearHistory();
  history.value = [];
  showToast('History cleared');
}

function when(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} h ago`;
  return new Date(ts).toLocaleDateString();
}
</script>
