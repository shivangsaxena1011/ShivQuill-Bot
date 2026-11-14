<template>
  <div ref="root" class="menu-wrap">
    <button class="btn btn-ghost btn-sm" type="button" :disabled="!text" aria-haspopup="menu" :aria-expanded="open" title="Export" @click="open = !open">
      <Download /> Export
    </button>
    <div v-if="open" class="menu" role="menu">
      <button v-for="f in formats" :key="f.id" class="menu-item" type="button" role="menuitem" @click="run(f.id)">
        <span>{{ f.label }}</span><span class="faint tiny">{{ f.ext }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { Download } from 'lucide-vue-next';
import { exportText, type ExportFormat } from '../lib/files';
import { showToast } from '../store';

const props = defineProps<{ text: string; title?: string }>();
const open = ref(false);
const root = ref<HTMLElement | null>(null);

const formats: { id: ExportFormat; label: string; ext: string }[] = [
  { id: 'docx', label: 'Word document', ext: '.docx' },
  { id: 'pdf', label: 'PDF (print)', ext: '.pdf' },
  { id: 'md', label: 'Markdown', ext: '.md' },
  { id: 'txt', label: 'Plain text', ext: '.txt' }
];

async function run(format: ExportFormat) {
  open.value = false;
  try {
    await exportText(props.text, format, props.title || 'ShivQuill document');
  } catch {
    showToast('Export failed — please try another format');
  }
}

function onDocClick(e: MouseEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));
</script>
