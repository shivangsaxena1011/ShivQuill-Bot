<template>
  <Transition name="fade">
    <div v-if="workspace.chatOpen" class="drawer-backdrop" @click="workspace.chatOpen = false"></div>
  </Transition>
  <Transition name="drawer">
    <aside v-if="workspace.chatOpen" class="drawer" role="dialog" aria-label="Writing assistant chat">
      <div class="pane-head">
        <div class="row"><Bot :size="18" /><strong>Writing assistant</strong></div>
        <div class="row">
          <button class="btn btn-ghost btn-sm" type="button" :disabled="messages.length <= 1" @click="reset">New chat</button>
          <button class="btn btn-ghost btn-sm btn-icon" type="button" aria-label="Close chat" @click="workspace.chatOpen = false"><X /></button>
        </div>
      </div>

      <label class="row small muted" style="padding: 8px 14px; border-bottom: 1px solid var(--border)">
        <input v-model="useContext" type="checkbox" />
        Use my current text as context
        <span v-if="useContext && contextText" class="badge">{{ contextText.length.toLocaleString() }} chars</span>
      </label>

      <div ref="log" class="chat-log">
        <div v-for="(m, i) in messages" :key="i" class="bubble" :class="m.role">{{ m.content }}</div>
        <div v-if="req.loading.value && live.text.value" class="bubble assistant">{{ live.text.value }}</div>
        <div v-else-if="req.loading.value" class="bubble assistant faint"><LoaderCircle class="spin" :size="14" /> Thinking…</div>
        <StatusBits kind="error" :message="req.error.value" @dismiss="req.error.value = ''" />
      </div>

      <div class="chip-row" style="padding: 0 12px 8px">
        <button v-for="q in quick" :key="q" class="chip" type="button" :disabled="req.loading.value" @click="send(q)">{{ q }}</button>
      </div>
      <form class="chat-input" @submit.prevent="send()">
        <textarea
          v-model="draft"
          placeholder="Ask anything about your writing…"
          maxlength="20000"
          @keydown.enter.exact.prevent="send()"
        ></textarea>
        <button v-if="req.loading.value" class="btn btn-danger btn-icon" type="button" aria-label="Stop" @click="req.cancel()"><Square /></button>
        <button v-else class="btn btn-primary btn-icon" type="submit" :disabled="!draft.trim()" aria-label="Send"><Send /></button>
      </form>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Bot, LoaderCircle, Send, Square, X } from 'lucide-vue-next';
import StatusBits from './StatusBits.vue';
import { api, type ChatTurn } from '../api';
import { useRequest } from '../composables/useRequest';
import { useLiveText } from '../composables/useLiveText';
import { workspace } from '../store';

const greeting: ChatTurn = { role: 'assistant', content: 'Hi! I can brainstorm, critique tone and clarity, or suggest better transitions. Ask me anything about your text.' };
const messages = ref<ChatTurn[]>([greeting]);
const draft = ref('');
const useContext = ref(true);
const log = ref<HTMLElement | null>(null);
const req = useRequest();
const live = useLiveText(1_000_000);
const quick = ['Critique the tone and clarity', 'Suggest 3 titles', 'Improve paragraph transitions'];

const CONTEXT_LIMIT = 100_000; // server maximum
const contextText = computed(() => (workspace.texts[workspace.activeTool] || '').trim().slice(0, CONTEXT_LIMIT));

function scrollDown() {
  nextTick(() => {
    if (log.value) log.value.scrollTop = log.value.scrollHeight;
  });
}
watch(() => workspace.chatOpen, open => open && scrollDown());

function reset() {
  req.cancel();
  messages.value = [greeting];
}

async function send(text?: string) {
  const content = (text ?? draft.value).trim();
  if (!content || req.loading.value) return;
  draft.value = '';
  messages.value.push({ role: 'user', content });
  scrollDown();

  // The greeting is UI-only; send real turns (last 20) to keep requests light
  const turns = messages.value.filter(m => m !== greeting).slice(-20);
  live.reset();
  const reply = await req.run(signal => api.chat(turns, useContext.value && contextText.value ? contextText.value : undefined, {
    signal,
    onDelta: d => {
      live.append(d);
      scrollDown();
    }
  }));
  if (reply) messages.value.push({ role: 'assistant', content: reply.content });
  else if (!req.error.value) messages.value.pop(); // cancelled: drop the unanswered question
  scrollDown();
}
</script>
