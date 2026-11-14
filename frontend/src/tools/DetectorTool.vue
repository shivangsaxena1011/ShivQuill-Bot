<template>
  <div class="stack">
    <div class="alert warn small">
      <CircleAlert />
      <span>Experimental: this measures statistical patterns (word variety, sentence rhythm), not real authorship. Never use it to accuse or grade anyone.</span>
    </div>

    <StatusBits kind="error" :message="req.error.value" @dismiss="req.error.value = ''" />

    <div class="split-side">
      <div class="card pane">
        <div class="pane-head">
          <span class="pane-title">{{ result ? 'Sentence view' : 'Text to analyze' }}</span>
          <div class="row">
            <button v-if="result" class="btn btn-ghost btn-sm" type="button" @click="result = null">Edit text</button>
            <button v-else class="btn btn-ghost btn-sm" type="button" @click="input = sample">Sample</button>
          </div>
        </div>
        <div v-if="result" class="pane-body output-text">
          <template v-for="(s, i) in visibleSentences" :key="i">
            <span :class="{ 'sentence-ai': s.flag === 'ai', 'sentence-mixed': s.flag === 'mixed' }" :title="`${s.aiLikelihood}% pattern score`">{{ s.text }}</span>{{ ' ' }}
          </template>
          <p v-if="result.sentences.length > visibleSentences.length" class="faint small" style="margin-top: 10px">
            Showing the first {{ visibleSentences.length }} of {{ result.sentences.length }} sentences.
          </p>
        </div>
        <textarea v-else v-model="input" class="editor" placeholder="Paste at least a few sentences (30+ characters)…" aria-label="Text to analyze"></textarea>
        <div class="pane-foot">
          <div class="legend" v-if="result">
            <span><i style="background: var(--bad-soft)"></i>AI-like pattern</span>
            <span><i style="background: var(--warn-soft)"></i>Mixed</span>
          </div>
          <span v-else></span>
          <button class="btn btn-primary" type="button" :disabled="req.loading.value || input.trim().length < 30" @click="run">
            <ScanSearch /> {{ req.loading.value ? 'Analyzing…' : 'Analyze' }}
          </button>
        </div>
      </div>

      <div class="card card-pad stack">
        <template v-if="result">
          <div>
            <div class="spread small"><span class="muted">Pattern score</span><strong>{{ result.overallVerdict }}</strong></div>
            <div class="meter" style="margin-top: 8px">
              <span :style="{ width: `${result.aiPercentage}%`, background: 'var(--bad)' }"></span>
              <span :style="{ width: `${result.humanPercentage}%`, background: 'var(--ok)' }"></span>
            </div>
            <div class="spread tiny faint" style="margin-top: 4px"><span>AI-like {{ result.aiPercentage }}%</span><span>Human-like {{ result.humanPercentage }}%</span></div>
          </div>
          <div class="stats">
            <div class="stat"><div class="stat-label">Word variety</div><div class="stat-value">{{ result.metrics.typeTokenRatio }}</div><div class="stat-note">unique / total words</div></div>
            <div class="stat"><div class="stat-label">Rhythm</div><div class="stat-value">{{ result.metrics.sentenceLengthCV }}</div><div class="stat-note">sentence length variation</div></div>
            <div class="stat"><div class="stat-label">Entropy</div><div class="stat-value">{{ result.metrics.shannonEntropy }}</div><div class="stat-note">information density</div></div>
            <div class="stat"><div class="stat-label">Confidence</div><div class="stat-value">{{ result.confidence }}</div><div class="stat-note">more text = better</div></div>
          </div>
          <p class="tiny faint">{{ result.falsePositiveRisk }}</p>
        </template>
        <StatusBits v-else kind="empty" message="Scores and metrics will appear here.">
          <template #icon><ScanSearch /></template>
        </StatusBits>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { CircleAlert, ScanSearch } from 'lucide-vue-next';
import StatusBits from '../components/StatusBits.vue';
import { api, type DetectorResult } from '../api';
import { useRequest } from '../composables/useRequest';
import { useToolInput } from '../store';

const sample = 'Furthermore, it is important to remember that utilizing advanced algorithms provides a testament to our system capabilities. Moreover, the framework ensures robust scalability across diverse environments. In conclusion, this approach delivers significant value to all stakeholders involved.';
const input = useToolInput('detector', sample);
const result = ref<DetectorResult | null>(null);
const req = useRequest();

// Rendering thousands of sentence spans is slow; cap the visual list
const visibleSentences = computed(() => (result.value?.sentences || []).slice(0, 1500));

async function run() {
  const r = await req.run(signal => api.detector(input.value, { signal }));
  if (r) result.value = r;
}
</script>
