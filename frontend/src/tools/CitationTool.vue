<template>
  <div class="split-side">
    <form class="card card-pad stack" @submit.prevent="run">
      <div class="spread">
        <div class="tabs" role="tablist" aria-label="Citation style">
          <button v-for="s in styles" :key="s" type="button" class="tab" :class="{ active: style === s }" @click="style = s">{{ s }}</button>
        </div>
        <select v-model="form.sourceType" class="select" style="width: 140px" aria-label="Source type">
          <option value="journal">Journal article</option>
          <option value="book">Book</option>
          <option value="website">Website</option>
        </select>
      </div>

      <label class="field">
        DOI (optional — fills in everything automatically)
        <div class="row">
          <input v-model="form.doi" class="input" placeholder="10.1109/CVPR.2016.90" />
        </div>
      </label>

      <div class="form-grid">
        <label class="field full">Title<input v-model="form.title" class="input" placeholder="Title of the work" /></label>
        <label class="field full">Authors (one per line, "First Last" or "Last, First")
          <textarea v-model="form.authors" class="textarea-sm" rows="2" placeholder="Kaiming He&#10;Xiangyu Zhang"></textarea>
        </label>
        <label class="field">Year<input v-model="form.year" class="input" placeholder="2016" inputmode="numeric" /></label>
        <label class="field">{{ form.sourceType === 'journal' ? 'Journal' : form.sourceType === 'website' ? 'Website name' : 'Series (optional)' }}
          <input v-model="form.containerTitle" class="input" />
        </label>
        <label class="field">Publisher<input v-model="form.publisher" class="input" /></label>
        <label v-if="form.sourceType === 'journal'" class="field">Volume<input v-model="form.volume" class="input" /></label>
        <label v-if="form.sourceType === 'journal'" class="field">Issue<input v-model="form.issue" class="input" /></label>
        <label v-if="form.sourceType !== 'website'" class="field">Pages<input v-model="form.pages" class="input" placeholder="770–778" /></label>
        <label class="field full">URL<input v-model="form.url" class="input" type="url" placeholder="https://…" /></label>
      </div>

      <StatusBits kind="error" :message="req.error.value" @dismiss="req.error.value = ''" />

      <div class="row">
        <button class="btn btn-primary" type="submit" :disabled="req.loading.value">
          <Quote /> {{ req.loading.value ? 'Generating…' : 'Generate citation' }}
        </button>
        <button class="btn btn-ghost" type="button" @click="reset">Reset</button>
      </div>
    </form>

    <div class="card card-pad stack">
      <template v-if="result">
        <div class="row-wrap">
          <span class="badge" :class="result.isVerified ? 'ok' : ''">{{ result.isVerified ? 'Verified via Crossref' : 'From your details' }}</span>
          <span class="badge brand">{{ style }}</span>
        </div>
        <div>
          <div class="spread"><span class="pane-title">Reference</span>
            <button class="btn btn-ghost btn-sm" type="button" @click="copyText(stripItalics(result.fullBibliographyEntry))"><Copy /> Copy</button>
          </div>
          <p class="citation-box" style="margin-top: 6px">
            <template v-for="(part, i) in italicParts(result.fullBibliographyEntry)" :key="i">
              <em v-if="part.italic">{{ part.text }}</em><span v-else>{{ part.text }}</span>
            </template>
          </p>
        </div>
        <div>
          <div class="spread"><span class="pane-title">In-text</span>
            <button class="btn btn-ghost btn-sm" type="button" @click="copyText(result.inTextCitation)"><Copy /> Copy</button>
          </div>
          <p class="citation-box" style="margin-top: 6px">{{ result.inTextCitation }}</p>
        </div>
      </template>
      <StatusBits v-else kind="empty" message="Enter a DOI or fill in the details, then generate.">
        <template #icon><Quote /></template>
      </StatusBits>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { Copy, Quote } from 'lucide-vue-next';
import StatusBits from '../components/StatusBits.vue';
import { api, type CitationParams, type CitationResult } from '../api';
import { useRequest } from '../composables/useRequest';
import { copyText } from '../store';
import { italicParts, stripItalics } from '../lib/text';

const styles = ['APA', 'MLA', 'Chicago', 'Harvard'] as const;
const style = ref<CitationParams['style']>('APA');

const blank = () => ({
  sourceType: 'journal' as CitationParams['sourceType'],
  doi: '', title: 'Deep Residual Learning for Image Recognition', authors: 'Kaiming He\nXiangyu Zhang\nShaoqing Ren\nJian Sun',
  year: '2016', containerTitle: 'Proceedings of the IEEE Conference on Computer Vision and Pattern Recognition',
  publisher: 'IEEE', volume: '', issue: '', pages: '770–778', url: ''
});
const form = reactive(blank());
const result = ref<CitationResult | null>(null);
const req = useRequest();

function reset() {
  Object.assign(form, { ...blank(), title: '', authors: '', year: '', containerTitle: '', publisher: '', pages: '' });
  result.value = null;
}

async function run() {
  const r = await req.run(signal => api.citation({
    style: style.value,
    sourceType: form.sourceType,
    doi: form.doi.trim() || undefined,
    title: form.title.trim() || undefined,
    authors: form.authors.split(/\n|;/).map(a => a.trim()).filter(Boolean),
    year: form.year.trim() || undefined,
    containerTitle: form.containerTitle.trim() || undefined,
    publisher: form.publisher.trim() || undefined,
    volume: form.volume.trim() || undefined,
    issue: form.issue.trim() || undefined,
    pages: form.pages.trim() || undefined,
    url: form.url.trim() || undefined
  }, { signal }));
  if (!r) return;
  result.value = r;
  // Fill the form from verified metadata, field by field (never cross-wired)
  if (r.isVerified) {
    const m = r.resolved;
    Object.assign(form, {
      sourceType: m.sourceType,
      title: m.title,
      authors: m.authors.map(a => (a.given ? `${a.given} ${a.family}` : a.family)).join('\n'),
      year: m.year,
      containerTitle: m.containerTitle || '',
      publisher: m.publisher || '',
      volume: m.volume || '',
      issue: m.issue || '',
      pages: m.pages || ''
    });
  }
}

// Re-format instantly when the style changes after a first result
watch(style, () => {
  if (result.value) run();
});
</script>
