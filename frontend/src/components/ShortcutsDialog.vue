<template>
  <Transition name="fade">
    <div v-if="workspace.shortcutsOpen" class="dialog-backdrop" @click.self="workspace.shortcutsOpen = false">
      <div ref="dialog" class="dialog card" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" tabindex="-1">
        <div class="spread">
          <h2 id="shortcuts-title" style="font-size: 17px">Keyboard shortcuts</h2>
          <button ref="closeBtn" class="btn btn-ghost btn-sm btn-icon" type="button" aria-label="Close" @click="workspace.shortcutsOpen = false"><X /></button>
        </div>
        <table class="shortcut-table">
          <tbody>
            <tr><td><kbd class="kbd">{{ mod }}</kbd> + <kbd class="kbd">Enter</kbd></td><td>Run the current tool (inside an editor)</td></tr>
            <tr><td><kbd class="kbd">{{ mod }}</kbd> + <kbd class="kbd">Z</kbd> / <kbd class="kbd">Y</kbd></td><td>Undo / redo in an editor (includes applied suggestions)</td></tr>
            <tr><td><kbd class="kbd">{{ mod }}</kbd> + <kbd class="kbd">/</kbd></td><td>Open or close the writing assistant</td></tr>
            <tr><td><kbd class="kbd">Esc</kbd></td><td>Close the assistant or this dialog</td></tr>
            <tr><td><kbd class="kbd">?</kbd></td><td>Show this list</td></tr>
            <tr v-for="(t, i) in tools.slice(0, 10)" :key="t.id">
              <td><kbd class="kbd">Alt</kbd> + <kbd class="kbd">{{ i === 9 ? 0 : i + 1 }}</kbd></td><td>{{ t.name }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
import { workspace } from '../store';

defineProps<{ tools: { id: string; name: string }[] }>();
const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

// Move focus into the dialog on open and restore it on close
const dialog = ref<HTMLElement | null>(null);
const closeBtn = ref<HTMLButtonElement | null>(null);
let returnFocus: HTMLElement | null = null;
watch(() => workspace.shortcutsOpen, open => {
  if (open) {
    returnFocus = document.activeElement as HTMLElement | null;
    nextTick(() => (closeBtn.value || dialog.value)?.focus());
  } else {
    returnFocus?.focus?.();
    returnFocus = null;
  }
});
</script>
