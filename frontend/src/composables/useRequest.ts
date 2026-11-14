import { ref, onBeforeUnmount } from 'vue';
import { errorMessage, isCancel } from '../api';

/**
 * Per-tool request state: each tool has its own loading flag, error and cancel button,
 * so running one tool never blocks or confuses another.
 */
export function useRequest() {
  const loading = ref(false);
  const error = ref('');
  let controller: AbortController | null = null;
  let onCancel: (() => void) | null = null;

  async function run<T>(task: (signal: AbortSignal) => Promise<T>, cancelHook?: () => void): Promise<T | undefined> {
    controller?.abort();
    controller = new AbortController();
    onCancel = cancelHook ?? null;
    const own = controller;
    loading.value = true;
    error.value = '';
    try {
      return await task(own.signal);
    } catch (err) {
      if (!isCancel(err) && !own.signal.aborted) error.value = errorMessage(err);
      return undefined;
    } finally {
      if (controller === own) {
        loading.value = false;
        controller = null;
        onCancel = null;
      }
    }
  }

  function cancel() {
    onCancel?.();
    controller?.abort();
    controller = null;
    onCancel = null;
    loading.value = false;
  }

  function setCancelHook(hook: () => void) {
    onCancel = hook;
  }

  onBeforeUnmount(cancel);

  return { loading, error, run, cancel, setCancelHook };
}
