<template>
  <div class="card pane">
    <div class="pane-head">
      <span class="pane-title">{{ title }}</span>
      <div class="row">
        <slot name="head" />
        <button v-if="modelValue" class="btn btn-ghost btn-sm" type="button" @click="emit('update:modelValue', '')" title="Clear text">
          <Trash2 /> Clear
        </button>
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
      @keydown.ctrl.enter.prevent="emit('submit')"
      @keydown.meta.enter.prevent="emit('submit')"
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
import { ref, watch } from 'vue';
import { Trash2 } from 'lucide-vue-next';
import { wordCount, formatNumber } from '../lib/text';

const props = withDefaults(defineProps<{
  modelValue: string;
  title?: string;
  placeholder?: string;
  maxChars?: number;
}>(), { title: 'Your text', placeholder: 'Paste or type your text…', maxChars: 1_000_000 });

const emit = defineEmits<{ 'update:modelValue': [value: string]; submit: [] }>();

const area = ref<HTMLTextAreaElement | null>(null);

/** Selects a character range and scrolls it into view (used to show where an issue is). */
function select(start: number, end: number) {
  const el = area.value;
  if (!el) return;
  el.focus();
  el.setSelectionRange(start, end);
  // Approximate scroll: place the selection about a third of the way down
  const ratio = start / Math.max(1, el.value.length);
  el.scrollTop = Math.max(0, ratio * el.scrollHeight - el.clientHeight / 3);
}

defineExpose({ select });

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value);
}

// Counting words on every keystroke is fine for normal text; for very large documents we
// debounce it so typing stays smooth.
const words = ref(wordCount(props.modelValue));
let timer: ReturnType<typeof setTimeout> | undefined;
watch(() => props.modelValue, v => {
  clearTimeout(timer);
  if (v.length < 50_000) words.value = wordCount(v);
  else timer = setTimeout(() => (words.value = wordCount(v)), 250);
});
</script>
