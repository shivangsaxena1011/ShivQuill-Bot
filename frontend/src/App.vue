<template>
  <div class="app">
    <aside class="sidebar" aria-label="Tools">
      <div class="brand">
        <div class="brand-mark">SQ</div>
        <div>
          <div class="brand-name">ShivQuill</div>
          <div class="brand-sub">AI writing studio</div>
        </div>
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
      </div>
    </aside>

    <div class="main">
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
          <button class="btn btn-icon" type="button" title="Writing assistant" aria-label="Open writing assistant" @click="workspace.chatOpen = true"><MessageSquare /></button>
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
      </main>
    </div>

    <ChatDrawer />
    <Transition name="fade"><div v-if="toast" class="toast" role="status">{{ toast }}</div></Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, type Component } from 'vue';
import {
  CircleAlert, FileText, Languages, Lightbulb, LoaderCircle, MessageSquare, Moon,
  PenLine, Quote, RefreshCw, ScanSearch, ShieldCheck, Sparkles, SpellCheck, Sun
} from 'lucide-vue-next';
import ChatDrawer from './components/ChatDrawer.vue';
import { workspace, toast, type ToolId } from './store';
import { useServerStatus } from './composables/useServerStatus';

// Each tool is its own small chunk, loaded on first use → fast first paint
const ParaphraseTool = defineAsyncComponent(() => import('./tools/ParaphraseTool.vue'));
const ReviewTool = defineAsyncComponent(() => import('./tools/ReviewTool.vue'));
const HumanizeTool = defineAsyncComponent(() => import('./tools/HumanizeTool.vue'));
const SummarizeTool = defineAsyncComponent(() => import('./tools/SummarizeTool.vue'));
const TranslateTool = defineAsyncComponent(() => import('./tools/TranslateTool.vue'));
const DetectorTool = defineAsyncComponent(() => import('./tools/DetectorTool.vue'));
const PlagiarismTool = defineAsyncComponent(() => import('./tools/PlagiarismTool.vue'));
const CitationTool = defineAsyncComponent(() => import('./tools/CitationTool.vue'));

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
      { id: 'humanize', name: 'Humanizer', short: 'Humanize', description: 'Turn stiff, formulaic text into a natural human voice.', icon: Sparkles, component: HumanizeTool }
    ]
  },
  {
    title: 'Understand',
    tools: [
      { id: 'summarize', name: 'Summarizer', short: 'Summarize', description: 'Condense long documents into key points or a short paragraph.', icon: FileText, component: SummarizeTool },
      { id: 'translate', name: 'Translator', short: 'Translate', description: 'Translate between 36 languages, keeping tone and formatting.', icon: Languages, component: TranslateTool }
    ]
  },
  {
    title: 'Verify',
    tools: [
      { id: 'detector', name: 'AI Pattern Check', short: 'AI check', description: 'Experimental statistics on how uniform the writing looks.', icon: ScanSearch, component: DetectorTool },
      { id: 'plagiarism', name: 'Plagiarism Check', short: 'Plagiarism', description: 'Compare text with the indexed reference library.', icon: ShieldCheck, component: PlagiarismTool },
      { id: 'citation', name: 'Citation Generator', short: 'Cite', description: 'APA, MLA, Chicago and Harvard references — auto-filled from a DOI.', icon: Quote, component: CitationTool }
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
  idle(() => { import('./tools/ReviewTool.vue'); import('./tools/SummarizeTool.vue'); });
});

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
