<template>
  <div class="tag-input" @click="input?.focus()">
    <span v-for="(tag, i) in modelValue" :key="tag" class="tag">
      {{ tag }}
      <button type="button" :aria-label="`Remove ${tag}`" @click.stop="remove(i)"><X :size="12" /></button>
    </span>
    <input
      ref="input"
      v-model="draft"
      :placeholder="modelValue.length ? '' : placeholder"
      :maxlength="100"
      :aria-label="placeholder"
      @keydown.enter.prevent="add"
      @keydown="onKey"
      @blur="add"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { X } from 'lucide-vue-next';

const props = withDefaults(defineProps<{ modelValue: string[]; placeholder?: string; max?: number }>(), {
  placeholder: 'Type and press Enter',
  max: 50
});
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();
const draft = ref('');
const input = ref<HTMLInputElement | null>(null);

function add() {
  const parts = draft.value.split(',').map(s => s.trim()).filter(Boolean);
  draft.value = '';
  if (!parts.length) return;
  const next = [...props.modelValue];
  for (const p of parts) {
    if (next.length >= props.max) break;
    if (!next.some(t => t.toLowerCase() === p.toLowerCase())) next.push(p);
  }
  emit('update:modelValue', next);
}

function remove(i: number) {
  emit('update:modelValue', props.modelValue.filter((_, idx) => idx !== i));
}

function onKey(e: KeyboardEvent) {
  if (e.key === ',') {
    e.preventDefault();
    add();
  } else if (e.key === 'Backspace' && !draft.value && props.modelValue.length) {
    remove(props.modelValue.length - 1);
  }
}
</script>
