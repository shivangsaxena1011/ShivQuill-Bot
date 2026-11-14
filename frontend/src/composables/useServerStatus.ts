import { ref, onMounted, onBeforeUnmount } from 'vue';
import { api, type Health } from '../api';

export type ServerState = 'checking' | 'waking' | 'online' | 'unconfigured' | 'mock' | 'offline';

/**
 * Checks /api/health. Free hosts (e.g. Render) sleep when idle and take ~30-60s to wake,
 * so we keep retrying for a while and show "Waking up" instead of a scary error.
 */
export function useServerStatus() {
  const state = ref<ServerState>('checking');
  const health = ref<Health | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let stopped = false;

  async function check() {
    try {
      const h = await api.health();
      health.value = h;
      state.value = h.engineStatus === 'active' ? 'online' : h.engineStatus === 'mock_test' ? 'mock' : 'unconfigured';
      attempts = 0;
      schedule(5 * 60 * 1000); // light re-check
    } catch {
      attempts++;
      state.value = attempts <= 12 ? 'waking' : 'offline';
      schedule(attempts <= 12 ? 5000 : 30000);
    }
  }

  function schedule(ms: number) {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(check, ms);
  }

  onMounted(check);
  onBeforeUnmount(() => {
    stopped = true;
    clearTimeout(timer);
  });

  return { state, health, retry: check };
}
