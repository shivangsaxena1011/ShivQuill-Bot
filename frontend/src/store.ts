import { reactive, ref, watch, type Ref } from 'vue';

export type ToolId =
  | 'paraphrase'
  | 'grammar'
  | 'suggestions'
  | 'humanize'
  | 'summarize'
  | 'translate'
  | 'detector'
  | 'plagiarism'
  | 'citation';

/** Small app-wide state (no Pinia needed). */
export const workspace = reactive({
  activeTool: 'paraphrase' as ToolId,
  chatOpen: false,
  /** Current input text of each tool — used as chat context for the tool on screen */
  texts: {} as Partial<Record<ToolId, string>>
});

/** Keeps the shared copy of a tool's input in sync (for the chat assistant). */
export function shareToolText(tool: ToolId, source: Ref<string>) {
  watch(source, v => (workspace.texts[tool] = v), { immediate: true });
}

// ---------------- Toast ----------------
export const toast = ref('');
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(message: string) {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), 1800);
}

// ---------------- Clipboard (works on HTTP too) ----------------
export async function copyText(text: string) {
  if (!text) return;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    showToast('Copied to clipboard');
  } catch {
    showToast('Could not copy — select the text and copy manually');
  }
}

// ---------------- Persisted drafts (per-viewer convenience) ----------------
export function persisted(key: string, initial: string): Ref<string> {
  let start = initial;
  try {
    const saved = localStorage.getItem(`sq:${key}`);
    if (saved !== null) start = saved;
  } catch { /* storage unavailable */ }
  const r = ref(start);
  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(r, v => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        // Don't store huge documents; they'd slow every page load
        if (v.length <= 200_000) localStorage.setItem(`sq:${key}`, v);
        else localStorage.removeItem(`sq:${key}`);
      } catch { /* quota or private mode */ }
    }, 600);
  });
  return r;
}
