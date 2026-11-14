import { ref, computed } from 'vue';

/**
 * Collects streamed text and updates the screen at most once per animation frame,
 * so fast token streams never cause jank. Only the tail is rendered while streaming.
 */
export function useLiveText(tailChars = 8000) {
  const full = ref('');
  const status = ref('');
  let pending = '';
  let frame = 0;

  function flush() {
    frame = 0;
    if (pending) {
      full.value += pending;
      pending = '';
    }
  }

  function append(delta: string) {
    pending += delta;
    if (!frame) frame = requestAnimationFrame(flush);
  }

  function reset() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    pending = '';
    full.value = '';
    status.value = '';
  }

  const visible = computed(() => (full.value.length > tailChars ? `…${full.value.slice(-tailChars)}` : full.value));

  return { text: full, visible, status, append, reset };
}
