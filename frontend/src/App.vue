<template>
  <div class="app">
    <aside class="sidebar" aria-label="Tools">
      <div class="brand-container">
        <a href="/" class="brand-logo-link" title="ShivQuill Bot — AI Writing Platform">
          <img src="/logo.jpg" alt="ShivQuill Bot Logo" class="brand-logo-img" />
        </a>
      </div>
      <template v-for="group in groups" :key="group.title">
        <div class="nav-section">{{ group.title }}</div>
        <button
          v-for="t in group.tools"
          :key="t.id"
          type="button"
          class="nav-item"
          :class="{ active: workspace.activeTool === t.id }"
          :aria-current="workspace.activeTool === t.id ? 'page' : undefined"
          @click="select(t.id)"
        >
          <component :is="t.icon" /> {{ t.name }}
        </button>
      </template>
      <div class="sidebar-foot">
        <button class="nav-item" type="button" @click="workspace.chatOpen = true"><MessageSquare /> Ask the assistant</button>
        <button class="nav-item" type="button" @click="workspace.shortcutsOpen = true"><Keyboard /> Shortcuts <kbd class="kbd">?</kbd></button>
        <div class="dev-card">
          <div class="dev-card-header">
            <span class="dev-badge-pill">Developer</span>
          </div>
          <a href="https://github.com/shivangsaxena1011" target="_blank" rel="noopener noreferrer" class="dev-card-link" title="View Shivang Saxena's GitHub">
            <div class="dev-avatar">SS</div>
            <div class="dev-details">
              <span class="dev-full-name">Shivang Saxena</span>
              <span class="dev-handle">@shivangsaxena1011</span>
            </div>
          </a>
        </div>
      </div>
    </aside>

    <div class="main">
      <div class="mobile-header-bar">
        <a href="/" class="mobile-logo-link" title="ShivQuill Bot">
          <img src="/logo.jpg" alt="ShivQuill Bot Logo" class="mobile-logo-img" />
        </a>
        <div class="mobile-dev-badge">
          <span class="mobile-dev-role">Dev</span>
          <a href="https://github.com/shivangsaxena1011" target="_blank" rel="noopener noreferrer" class="mobile-dev-name">
            Shivang Saxena ↗
          </a>
        </div>
      </div>

      <nav class="mobile-tabs" aria-label="Tools">
        <button
          v-for="t in allTools"
          :key="t.id"
          type="button"
          class="chip"
          :class="{ active: workspace.activeTool === t.id }"
          @click="select(t.id)"
        ><component :is="t.icon" /> {{ t.short }}</button>
      </nav>

      <header class="topbar">
        <div class="topbar-title">
          <h1>{{ current.name }}</h1>
          <p>{{ current.description }}</p>
        </div>
        <div class="topbar-actions">
          <span class="badge" :title="health?.providerMessage || ''">
            <span class="dot" :class="statusDot"></span>{{ statusText }}
          </span>
          <button class="btn btn-ghost btn-icon" type="button" :title="`Theme: ${theme}`" aria-label="Toggle theme" @click="toggleTheme">
            <Moon v-if="isDark" /><Sun v-else />
          </button>
          <button v-if="installPrompt" class="btn btn-sm" type="button" title="Install ShivQuill as an app" @click="install"><Download /> Install</button>
          <button class="btn btn-icon" type="button" title="Writing assistant (Ctrl+/)" aria-label="Open writing assistant" @click="workspace.chatOpen = true"><MessageSquare /></button>
        </div>
      </header>

      <main class="content">
        <div v-if="state === 'unconfigured'" class="alert warn small" style="margin-bottom: 14px">
          <CircleAlert />
          <span>No AI provider is configured on the server. Set <code>GROQ_API_KEY</code> (or another provider key) in the server environment, then restart.</span>
        </div>
        <div v-else-if="state === 'offline'" class="alert bad small" style="margin-bottom: 14px">
          <CircleAlert />
          <span>Can't reach the server right now.</span>
          <button class="btn btn-sm" type="button" style="margin-left: auto" @click="retry"><RefreshCw /> Retry</button>
        </div>
        <div v-else-if="state === 'waking'" class="alert info small" style="margin-bottom: 14px">
          <LoaderCircle class="spin" />
          <span>Waking up the server — this can take up to a minute after it's been idle.</span>
        </div>

        <KeepAlive>
          <component :is="current.component" :key="current.id" v-bind="current.props || {}" />
        </KeepAlive>

        <footer class="app-footer">
          <div class="footer-wrap">
            <div class="footer-brand-info">
              <img src="/logo.jpg" alt="ShivQuill Bot" class="footer-logo-img" />
              <div class="footer-text">
                <span class="footer-title">ShivQuill AI Writing Platform</span>
                <span class="footer-sub">Designed &amp; Developed by <a href="https://github.com/shivangsaxena1011" target="_blank" rel="noopener noreferrer" class="dev-inline-link">Shivang Saxena</a></span>
              </div>
            </div>
            <div class="footer-links">
              <a href="https://github.com/shivangsaxena1011/ShivQuill-Bot" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-ghost">
                GitHub Repository ↗
              </a>
            </div>
          </div>
        </footer>
      </main>
    </div>

    <ChatDrawer />
    <ShortcutsDialog :tools="allTools" />
    <Transition name="fade"><div v-if="toast" class="toast" role="status">{{ toast }}</div></Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, h, onBeforeUnmount, onMounted, ref, type Component } from 'vue';
import {
  BookOpenCheck, CircleAlert, Download, FileText, Gauge, Keyboard, Languages, Library, Lightbulb, LoaderCircle,
  MessageSquare, Moon, PenLine, Quote, RefreshCw, ScanSearch, ShieldCheck, Sparkles, SpellCheck, Sun
} from 'lucide-vue-next';
import ShortcutsDialog from './components/ShortcutsDialog.vue';
import ChatDrawer from './components/ChatDrawer.vue';
import { workspace, toast, type ToolId } from './store';
import { useServerStatus } from './composables/useServerStatus';

// After a deploy, an open tab may ask for old chunk hashes that no longer exist: reload once
// (at most every 10 s, so a real outage can't cause a reload loop) to pick up the new build.
window.addEventListener('vite:preloadError', e => {
  try {
    const last = Number(sessionStorage.getItem('sq:chunk-reload') || 0);
    if (Date.now() - last < 10_000) return; // let the error surface instead
    sessionStorage.setItem('sq:chunk-reload', String(Date.now()));
  } catch { /* ignore */ }
  e.preventDefault();
  window.location.reload();
});

// Shown if a tool's code can't be loaded (offline, or a stale build)
const ToolLoadError: Component = {
  render: () => h('div', { class: 'alert bad small', role: 'alert' }, [
    h('span', 'This tool could not be loaded — the app may have been updated or you may be offline.'),
    h('button', { class: 'btn btn-sm', type: 'button', style: 'margin-left: auto', onClick: () => window.location.reload() }, 'Reload')
  ])
};
const lazy = (loader: () => Promise<any>) => defineAsyncComponent({ loader, errorComponent: ToolLoadError });

// Each tool is its own small chunk, loaded on first use → fast first paint
const ParaphraseTool = lazy(() => import('./tools/ParaphraseTool.vue'));
const ReviewTool = lazy(() => import('./tools/ReviewTool.vue'));
const HumanizeTool = lazy(() => import('./tools/HumanizeTool.vue'));
const SummarizeTool = lazy(() => import('./tools/SummarizeTool.vue'));
const TranslateTool = lazy(() => import('./tools/TranslateTool.vue'));
const DetectorTool = lazy(() => import('./tools/DetectorTool.vue'));
const PlagiarismTool = lazy(() => import('./tools/PlagiarismTool.vue'));
const CitationTool = lazy(() => import('./tools/CitationTool.vue'));
const ToneTool = lazy(() => import('./tools/ToneTool.vue'));
const ReadabilityTool = lazy(() => import('./tools/ReadabilityTool.vue'));
const LibraryTool = lazy(() => import('./tools/LibraryTool.vue'));

interface ToolDef {
  id: ToolId;
  name: string;
  short: string;
  description: string;
  icon: Component;
  component: Component;
  props?: Record<string, unknown>;
}

const groups: { title: string; tools: ToolDef[] }[] = [
  {
    title: 'Write',
    tools: [
      { id: 'paraphrase', name: 'Paraphraser', short: 'Paraphrase', description: 'Rewrite text in 9 styles while keeping facts, numbers and citations intact.', icon: PenLine, component: ParaphraseTool },
      { id: 'grammar', name: 'Grammar Checker', short: 'Grammar', description: 'Find and fix grammar, spelling and punctuation mistakes.', icon: SpellCheck, component: ReviewTool, props: { kind: 'grammar' } },
      { id: 'suggestions', name: 'Writing Suggestions', short: 'Suggestions', description: 'Sharpen clarity, tone, word choice and conciseness.', icon: Lightbulb, component: ReviewTool, props: { kind: 'suggestions' } },
      { id: 'humanize', name: 'Humanizer', short: 'Humanize', description: 'Turn stiff, formulaic text into a natural human voice.', icon: Sparkles, component: HumanizeTool },
      { id: 'tone', name: 'Tone', short: 'Tone', description: 'See how your writing sounds, then switch it to the tone you want.', icon: Gauge, component: ToneTool }
    ]
  },
  {
    title: 'Understand',
    tools: [
      { id: 'summarize', name: 'Summarizer', short: 'Summarize', description: 'Condense long documents into key points or a short paragraph.', icon: FileText, component: SummarizeTool },
      { id: 'translate', name: 'Translator', short: 'Translate', description: 'Translate between 36 languages, keeping tone and formatting.', icon: Languages, component: TranslateTool },
      { id: 'readability', name: 'Readability', short: 'Readability', description: 'Grade level, reading time, passive voice, long sentences and repeated words — live, in your browser.', icon: BookOpenCheck, component: ReadabilityTool }
    ]
  },
  {
    title: 'Verify',
    tools: [
      { id: 'detector', name: 'AI Detector', short: 'AI check', description: 'Sentence-by-sentence estimate of AI-generated and AI-refined writing.', icon: ScanSearch, component: DetectorTool },
      { id: 'plagiarism', name: 'Plagiarism Checker', short: 'Plagiarism', description: 'Search the web, Wikipedia and papers for copied or reworded passages.', icon: ShieldCheck, component: PlagiarismTool },
      { id: 'citation', name: 'Citation Generator', short: 'Cite', description: 'APA, MLA, Chicago and Harvard references from a DOI or ISBN, with BibTeX/RIS export.', icon: Quote, component: CitationTool }
    ]
  },
  {
    title: 'Workspace',
    tools: [
      { id: 'library', name: 'Library', short: 'Library', description: 'Your saved documents and recent results, stored in this browser.', icon: Library, component: LibraryTool }
    ]
  }
];
const allTools = groups.flatMap(g => g.tools);
const current = computed(() => allTools.find(t => t.id === workspace.activeTool) || allTools[0]);

function select(id: ToolId) {
  workspace.activeTool = id;
  try { localStorage.setItem('sq:tool', id); } catch { /* ignore */ }
  window.scrollTo({ top: 0 });
}
onMounted(() => {
  try {
    const saved = localStorage.getItem('sq:tool') as ToolId | null;
    if (saved && allTools.some(t => t.id === saved)) workspace.activeTool = saved;
  } catch { /* ignore */ }
  // Warm up the most-used tool chunks in idle time so switching is instant
  const idle = (window as any).requestIdleCallback || ((cb: () => void) => setTimeout(cb, 1500));
  idle(() => { import('./tools/ReviewTool.vue').catch(() => undefined); import('./tools/SummarizeTool.vue').catch(() => undefined); });
});

// ---------------- Keyboard shortcuts ----------------
function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}
// On macOS Option+digit types characters (#, €, ™, £…), so it must not be stolen while typing
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
function onGlobalKey(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey;
  if (e.altKey && !mod && /^Digit[0-9]$/.test(e.code) && !(IS_MAC && isTyping(e))) {
    const n = Number(e.code.slice(5));
    const tool = allTools[n === 0 ? 9 : n - 1];
    if (tool) {
      e.preventDefault();
      select(tool.id);
    }
  } else if (mod && e.key === '/') {
    e.preventDefault();
    workspace.chatOpen = !workspace.chatOpen;
  } else if (e.key === 'Escape') {
    if (workspace.shortcutsOpen) workspace.shortcutsOpen = false;
    else if (workspace.chatOpen) workspace.chatOpen = false;
  } else if (e.key === '?' && !isTyping(e)) {
    e.preventDefault();
    workspace.shortcutsOpen = !workspace.shortcutsOpen;
  }
}
onMounted(() => window.addEventListener('keydown', onGlobalKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey));

// ---------------- Install as an app (PWA) ----------------
const installPrompt = ref<any>(null);
window.addEventListener('beforeinstallprompt', (e: Event) => {
  e.preventDefault();
  installPrompt.value = e;
});
window.addEventListener('appinstalled', () => (installPrompt.value = null));
async function install() {
  const p = installPrompt.value;
  if (!p) return;
  p.prompt();
  await p.userChoice.catch(() => undefined);
  installPrompt.value = null;
}

// ---------------- Server status ----------------
const { state, health, retry } = useServerStatus();
const statusText = computed(() => ({
  checking: 'Connecting…',
  waking: 'Waking up…',
  online: health.value?.model ? `Online · ${health.value.model}` : 'Online',
  mock: 'Test mode',
  unconfigured: 'No AI provider',
  offline: 'Offline'
}[state.value]));
const statusDot = computed(() => ({
  checking: 'warn pulse', waking: 'warn pulse', online: 'ok', mock: 'warn', unconfigured: 'bad', offline: 'bad'
}[state.value]));

// ---------------- Theme ----------------
type Theme = 'system' | 'light' | 'dark';
const theme = ref<Theme>('system');
const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)');
const sysIsDark = ref(!!systemDark?.matches);
systemDark?.addEventListener?.('change', e => (sysIsDark.value = e.matches));
const isDark = computed(() => theme.value === 'dark' || (theme.value === 'system' && sysIsDark.value));

function applyTheme() {
  if (theme.value === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme.value);
}
function toggleTheme() {
  theme.value = isDark.value ? 'light' : 'dark';
  applyTheme();
  try { localStorage.setItem('sq:theme', theme.value); } catch { /* ignore */ }
}
try {
  const saved = localStorage.getItem('sq:theme') as Theme | null;
  if (saved === 'light' || saved === 'dark') theme.value = saved;
} catch { /* ignore */ }
applyTheme();
</script>
