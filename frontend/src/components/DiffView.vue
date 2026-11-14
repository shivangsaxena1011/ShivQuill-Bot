<template>
  <div class="output-text">
    <template v-if="tooLarge">
      <div class="alert info small" style="margin-bottom: 10px">
        Highlighting is turned off for very large outputs to keep the page fast.
      </div>
      {{ plainText }}
    </template>
    <template v-else>
      <template v-for="(span, i) in spans" :key="i">
        <span v-if="span.type === 'unchanged'">{{ span.value }}</span>
        <span
          v-else-if="span.type === 'synonym' || span.type === 'restructured'"
          class="hl-synonym"
          :class="{ clickable: interactive && options(span).length > 1 }"
          :title="span.original ? `Was: ${span.original}${interactive && options(span).length > 1 ? ' — click for another word' : ''}` : undefined"
          :role="interactive && options(span).length > 1 ? 'button' : undefined"
          :tabindex="interactive && options(span).length > 1 ? 0 : undefined"
          @click="interactive && cycle(i)"
          @keydown.enter.prevent="interactive && cycle(i)"
          @keydown.space.prevent="interactive && cycle(i)"
        >{{ span.value }}</span>
        <span v-else-if="span.type === 'added'" class="hl-added">{{ span.value }}</span>
        <span v-else-if="span.type === 'removed' && showRemoved" class="hl-removed">{{ span.value }}</span>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { DiffSpan } from '../api';

const props = withDefaults(defineProps<{
  diffSpans: DiffSpan[];
  /** Allow clicking synonyms to cycle alternatives */
  interactive?: boolean;
  showRemoved?: boolean;
}>(), { interactive: false, showRemoved: false });

const emit = defineEmits<{ 'update:text': [text: string]; 'update:spans': [spans: DiffSpan[]] }>();

const MAX_SPANS = 4000;
const spans = ref<DiffSpan[]>([]);
watch(() => props.diffSpans, v => (spans.value = v.map(s => ({ ...s }))), { immediate: true });

const tooLarge = computed(() => spans.value.length > MAX_SPANS);
const plainText = computed(() => spans.value.filter(s => s.type !== 'removed').map(s => s.value).join(''));

function options(span: DiffSpan): string[] {
  const core = span.value.trim();
  const list = [core, ...(span.alternatives || [])].map(s => s.trim()).filter(Boolean);
  return Array.from(new Set(list.map(s => s.toLowerCase()))).map(lower => list.find(s => s.toLowerCase() === lower)!);
}

function matchCase(word: string, like: string): string {
  return like && like[0] === like[0].toUpperCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

function cycle(index: number) {
  const span = spans.value[index];
  const opts = options(span);
  if (opts.length < 2) return;
  // Keep surrounding whitespace exactly as it was
  const m = span.value.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  const current = m[2];
  const pos = opts.findIndex(o => o.toLowerCase() === current.toLowerCase());
  const next = matchCase(opts[(pos + 1) % opts.length], current);
  span.value = `${m[1]}${next}${m[3]}`;
  emit('update:spans', spans.value.map(s => ({ ...s })));
  emit('update:text', plainText.value);
}
</script>
