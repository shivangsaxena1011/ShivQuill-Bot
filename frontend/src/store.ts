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
  | 'citation'
  | 'tone'
  | 'readability'
  | 'library';

/** Small app-wide state (no Pinia needed). */
export const workspace = reactive({
  activeTool: 'paraphrase' as ToolId,
  chatOpen: false,
  /** Current input text of each tool — used as chat context for the tool on screen */
  texts: {} as Partial<Record<ToolId, string>>,
  /** Text waiting to be loaded into a tool (from the Library or "Send to") */
  pendingLoad: null as null | { tool: ToolId; text: string },
  shortcutsOpen: false
});

/** Opens a tool and loads text into its input. */
export function openInTool(tool: ToolId, text: string) {
  workspace.pendingLoad = { tool, text };
  workspace.activeTool = tool;
}

/**
 * A tool's main input: remembered between visits, shared with the chat assistant, and able to
 * receive text from the Library ("Open in…").
 */
export function useToolInput(tool: ToolId, sample: string): Ref<string> {
  const input = persisted(tool, sample);
  shareToolText(tool, input);
  watch(
    () => workspace.pendingLoad,
    load => {
      if (load && load.tool === tool) {
        input.value = load.text;
        workspace.pendingLoad = null;
      }
    },
    { immediate: true }
  );
  return input;
}

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
  const save = () => {
    timer = undefined;
    try {
      // Don't store huge documents; they'd slow every page load
      if (r.value.length <= 200_000) localStorage.setItem(`sq:${key}`, r.value);
      else localStorage.removeItem(`sq:${key}`);
    } catch { /* quota or private mode */ }
  };
  watch(r, () => {
    clearTimeout(timer);
    timer = setTimeout(save, 600);
  });
  // Write a pending debounced save when the page is closed or reloaded, so the last keystrokes survive
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        save();
      }
    });
  }
  return r;
}

/** Like `persisted`, for small JSON values (lists, presets). */
export function persistedJson<T>(key: string, initial: T): Ref<T> {
  let start = initial;
  try {
    const saved = localStorage.getItem(`sq:${key}`);
    if (saved !== null) start = JSON.parse(saved) as T;
  } catch { /* storage unavailable or corrupt */ }
  const r = ref(start) as Ref<T>;
  watch(r, v => {
    try {
      localStorage.setItem(`sq:${key}`, JSON.stringify(v));
    } catch { /* quota or private mode */ }
  }, { deep: true });
  return r;
}
