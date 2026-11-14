<template>
  <div class="card pane" :class="{ 'drop-active': dragging }" @dragover.prevent="dragging = true" @dragleave.self="dragging = false" @drop.prevent="onDrop">
    <div class="pane-head">
      <span class="pane-title">{{ title }}</span>
      <div class="row">
        <slot name="head" />
        <button class="btn btn-ghost btn-sm btn-icon" type="button" title="Undo (Ctrl+Z)" aria-label="Undo" :disabled="!canUndo" @click="undo"><Undo2 /></button>
        <button class="btn btn-ghost btn-sm btn-icon" type="button" title="Redo (Ctrl+Y)" aria-label="Redo" :disabled="!canRedo" @click="redo"><Redo2 /></button>
        <button class="btn btn-ghost btn-sm btn-icon" type="button" title="Import .txt, .md or .docx" aria-label="Import file" @click="fileInput?.click()"><Upload /></button>
        <button v-if="tool && modelValue.trim()" class="btn btn-ghost btn-sm btn-icon" type="button" title="Save to Library" aria-label="Save to Library" @click="save"><BookmarkPlus /></button>
        <button v-if="modelValue" class="btn btn-ghost btn-sm btn-icon" type="button" title="Clear text" aria-label="Clear text" @click="setValue('')"><Trash2 /></button>
        <input ref="fileInput" type="file" :accept="IMPORT_ACCEPT" hidden @change="onPick" />
      </div>
    </div>
    <textarea
      ref="area"
      class="editor"
      :value="modelValue"
      :placeholder="placeholder"
      :maxlength="maxChars"
      spellcheck="true"
      @input="onInput"
      @keydown="onKeydown"
    ></textarea>
    <div class="pane-foot">
      <span>
        {{ formatNumber(words) }} words · {{ formatNumber(modelValue.length) }} chars
        <span v-if="modelValue.length > maxChars * 0.9" class="badge warn">near limit</span>
      </span>
      <div class="row">
        <slot name="foot" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { BookmarkPlus, Redo2, Trash2, Undo2, Upload } from 'lucide-vue-next';
import { wordCount, formatNumber } from '../lib/text';
import { IMPORT_ACCEPT, importFile } from '../lib/files';
import { saveDocument } from '../lib/db';
import { showToast, type ToolId } from '../store';

const props = withDefaults(defineProps<{
  modelValue: string;
  title?: string;
  placeholder?: string;
  maxChars?: number;
  /** When set, enables "Save to Library" for this tool */
  tool?: ToolId;
}>(), { title: 'Your text', placeholder: 'Paste or type your text…', maxChars: 1_000_000 });

const emit = defineEmits<{ 'update:modelValue': [value: string]; submit: [] }>();

const area = ref<HTMLTextAreaElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const dragging = ref(false);

// ---------------- Undo / redo ----------------
// Covers typing AND programmatic changes (apply suggestion, import, clear), which the browser's
// native undo loses. Typing is grouped into snapshots after short pauses.
const past = ref<string[]>([]);
const future = ref<string[]>([]);
const committed = ref(props.modelValue);
let typingTimer: ReturnType<typeof setTimeout> | undefined;
let typing = false;
let travelling = false;

const canUndo = computed(() => past.value.length > 0 || props.modelValue !== committed.value);
const canRedo = computed(() => future.value.length > 0);

function limit() {
  return props.modelValue.length > 200_000 ? 5 : 40;
}

function commit(next: string) {
  if (next === committed.value) return;
  past.value.push(committed.value);
  const max = limit();
  if (past.value.length > max) past.value.splice(0, past.value.length - max);
  future.value = [];
  committed.value = next;
}

watch(() => props.modelValue, v => {
  if (travelling) {
    travelling = false;
    committed.value = v;
    return;
  }
  if (typing) {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      typing = false;
      commit(props.modelValue);
    }, 700);
  } else {
    commit(v);
  }
});

function flushTyping() {
  if (typing) {
    clearTimeout(typingTimer);
    typing = false;
    commit(props.modelValue);
  }
}

function undo() {
  flushTyping();
  const prev = past.value.pop();
  if (prev === undefined) return;
  future.value.push(props.modelValue);
  travelling = true;
  emit('update:modelValue', prev);
}

function redo() {
  const next = future.value.pop();
  if (next === undefined) return;
  past.value.push(props.modelValue);
  travelling = true;
  emit('update:modelValue', next);
}

function setValue(v: string) {
  flushTyping();
  emit('update:modelValue', v);
}

// ---------------- Input & keys ----------------
function onInput(e: Event) {
  typing = true;
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value);
}

function onKeydown(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === 'Enter') {
    e.preventDefault();
    emit('submit');
  } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
  } else if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
    e.preventDefault();
    redo();
  }
}

// ---------------- Import / save ----------------
async function load(file: File) {
  try {
    const text = await importFile(file);
    if (!text.trim()) {
      showToast('That file has no readable text');
      return;
    }
    setValue(text);
    showToast(`Imported ${file.name}`);
  } catch (err: any) {
    showToast(err?.message || 'Could not read that file');
  }
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) load(file);
}

function onDrop(e: DragEvent) {
  dragging.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) load(file);
}

async function save() {
  if (!props.tool) return;
  const suggested = props.modelValue.trim().split('\n')[0].slice(0, 60);
  const title = window.prompt('Save to Library as:', suggested);
  if (title === null) return;
  await saveDocument({ title: title || suggested, text: props.modelValue, tool: props.tool });
  showToast('Saved to Library');
}

// ---------------- Selection helpers (used by tools) ----------------
function select(start: number, end: number) {
  const el = area.value;
  if (!el) return;
  el.focus();
  el.setSelectionRange(start, end);
  const ratio = start / Math.max(1, el.value.length);
  el.scrollTop = Math.max(0, ratio * el.scrollHeight - el.clientHeight / 3);
}

function getSelection(): { start: number; end: number; text: string } {
  const el = area.value;
  if (!el) return { start: 0, end: 0, text: '' };
  return { start: el.selectionStart, end: el.selectionEnd, text: el.value.slice(el.selectionStart, el.selectionEnd) };
}

function replaceRange(start: number, end: number, text: string) {
  setValue(props.modelValue.slice(0, start) + text + props.modelValue.slice(end));
  requestAnimationFrame(() => select(start, start + text.length));
}

defineExpose({ select, getSelection, replaceRange });

// ---------------- Word count (debounced for huge texts) ----------------
const words = ref(wordCount(props.modelValue));
let countTimer: ReturnType<typeof setTimeout> | undefined;
watch(() => props.modelValue, v => {
  clearTimeout(countTimer);
  if (v.length < 50_000) words.value = wordCount(v);
  else countTimer = setTimeout(() => (words.value = wordCount(v)), 250);
});
</script>
