<template>
  <div v-if="kind === 'error' && message" class="alert bad" role="alert">
    <CircleAlert />
    <span>{{ message }}</span>
    <button class="alert-close" type="button" aria-label="Dismiss" @click="emit('dismiss')"><X :size="16" /></button>
  </div>
  <div v-else-if="kind === 'loading'" class="loading-state">
    <LoaderCircle class="spin" />
    <span>{{ message || 'Working…' }}</span>
    <div v-if="progress !== undefined" class="progress"><span :style="{ width: `${progress}%` }"></span></div>
    <slot />
  </div>
  <div v-else-if="kind === 'empty'" class="empty">
    <div>
      <slot name="icon" />
      <p>{{ message }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CircleAlert, LoaderCircle, X } from 'lucide-vue-next';

defineProps<{ kind: 'error' | 'loading' | 'empty'; message?: string; progress?: number }>();
const emit = defineEmits<{ dismiss: [] }>();
</script>
