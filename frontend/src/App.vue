<template>
  <div class="min-h-screen flex flex-col bg-slate-50 text-slate-800">
    <!-- Top Navigation Header -->
    <header class="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-md">
            SQ
          </div>
          <div>
            <span class="text-xl font-bold tracking-tight text-slate-900">ShivQuill</span>
            <span class="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">AI Platform</span>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <nav class="hidden md:flex space-x-1">
          <button
            v-for="tool in tools"
            :key="tool.id"
            @click="activeTool = tool.id"
            :class="[
              activeTool === tool.id
                ? 'bg-blue-50 text-blue-700 border-blue-600 font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-transparent',
              'px-3.5 py-2 text-sm font-medium rounded-lg border-b-2 transition-all flex items-center space-x-1.5'
            ]"
          >
            <span>{{ tool.name }}</span>
          </button>
        </nav>

        <!-- Right Side Health & Settings -->
        <div class="flex items-center space-x-3">
          <div class="flex items-center space-x-1.5 text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
            <span :class="['w-2 h-2 rounded-full', backendHealthy ? (isMockMode ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse') : 'bg-red-500']"></span>
            <span>{{ backendHealthy ? (isMockMode ? 'Engine: Test Mock' : `Engine: ${activeProvider}`) : 'Connecting...' }}</span>
          </div>
          <button @click="openChat = !openChat" class="btn btn-outline text-xs px-3 py-1.5 flex items-center space-x-1">
            <span>AI Chat Assistant</span>
          </button>
        </div>
      </div>
    </header>

    <!-- Main Workspace Container -->
    <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <!-- Error Feedback Banner -->
      <div v-if="errorMessage" class="mb-4 p-3 rounded-lg bg-red-100 border border-red-300 text-red-800 text-xs flex justify-between items-center shadow-sm">
        <div class="flex items-center space-x-2">
          <span class="font-bold">Error:</span>
          <span>{{ errorMessage }}</span>
        </div>
        <button @click="errorMessage = ''" class="font-bold text-red-600 hover:text-red-900 ml-4 text-sm">&times;</button>
      </div>
      <!-- 1. PARAPHRASER VIEW -->
      <section v-if="activeTool === 'paraphrase'" class="space-y-4">
        <!-- Paraphraser Mode Selector & Synonym Slider -->
        <div class="card p-4 flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center flex-wrap gap-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-2">Modes:</span>
            <button
              v-for="mode in paraphraseModes"
              :key="mode.id"
              @click="chosenMode = mode.id"
              :class="[
                chosenMode === mode.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                'px-3 py-1.5 text-xs font-medium rounded-md transition-all'
              ]"
            >
              {{ mode.label }}
            </button>
          </div>

          <!-- Synonym Intensity Slider -->
          <div class="flex items-center space-x-3 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <span class="text-xs font-medium text-slate-600">Synonyms:</span>
            <div class="flex items-center space-x-1">
              <button
                v-for="level in [1, 2, 3, 4]"
                :key="level"
                @click="synonymStrength = level"
                :class="[
                  synonymStrength >= level ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-500',
                  'w-6 h-6 rounded text-xs font-bold transition-all'
                ]"
              >
                {{ level }}
              </button>
            </div>
            <span class="text-xs text-slate-500">
              {{ synonymStrength === 1 ? 'Few Changes' : synonymStrength === 2 ? 'Balanced' : synonymStrength === 3 ? 'More Changes' : 'Maximum' }}
            </span>
          </div>
        </div>

        <!-- Custom Mode Instruction Input -->
        <div v-if="chosenMode === 'custom'" class="card p-3">
          <label class="block text-xs font-semibold text-slate-700 mb-1">Custom Writing Instructions:</label>
          <input
            v-model="customInstruction"
            type="text"
            placeholder="E.g., Rewrite in a humorous tone, make it sound like a persuasive investor pitch..."
            class="w-full text-sm px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:border-blue-500"
          />
        </div>

        <!-- Dual Panel Editor (Input & Output) -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Input Card -->
          <div class="card p-4 flex flex-col h-[520px]">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100">
              <span class="text-xs font-semibold uppercase text-slate-500 tracking-wider">Original Text</span>
              <div class="flex items-center space-x-2">
                <button @click="loadSample('academic')" class="text-xs text-blue-600 hover:underline">Sample</button>
                <button @click="inputText = ''" class="text-xs text-slate-400 hover:text-red-500">Clear</button>
              </div>
            </div>
            <textarea
              v-model="inputText"
              placeholder="Paste or type text here to paraphrase..."
              class="flex-1 w-full mt-3 resize-none border-none focus:outline-none text-slate-800 text-base leading-relaxed"
            ></textarea>
            <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>{{ wordCount(inputText) }} words | {{ inputText.length }} chars</span>
              <button
                @click="runParaphrase"
                :disabled="isLoading || inputText.trim().length === 0"
                class="btn btn-primary"
              >
                <span v-if="isLoading">Processing...</span>
                <span v-else>Paraphrase</span>
              </button>
            </div>
          </div>

          <!-- Output Card -->
          <div class="card p-4 flex flex-col h-[520px]">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100">
              <div class="flex items-center space-x-2">
                <span class="text-xs font-semibold uppercase text-slate-500 tracking-wider">Paraphrased Output</span>
                <span v-if="paraphraseResult" class="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 capitalize">
                  {{ chosenMode }}
                </span>
              </div>
              <div class="flex items-center space-x-2">
                <button @click="viewMode = viewMode === 'rich' ? 'plain' : 'rich'" class="text-xs text-slate-600 hover:underline">
                  {{ viewMode === 'rich' ? 'Plain Text' : 'Highlight Changes' }}
                </button>
                <button @click="copyToClipboard(paraphraseResult?.paraphrasedText)" class="text-xs text-blue-600 hover:underline">
                  {{ copySuccess ? 'Copied!' : 'Copy' }}
                </button>
              </div>
            </div>

            <!-- Output Body -->
            <div class="flex-1 mt-3 overflow-y-auto text-base leading-relaxed">
              <div v-if="isLoading" class="h-full flex flex-col items-center justify-center text-slate-400 space-y-2">
                <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p class="text-sm">Synthesizing rewritten text...</p>
              </div>

              <!-- Rich Highlight View -->
              <div v-else-if="paraphraseResult && viewMode === 'rich'" class="whitespace-pre-wrap">
                <span
                  v-for="(span, idx) in paraphraseResult.diffSpans"
                  :key="idx"
                  :class="{
                    'diff-synonym': span.type === 'synonym',
                    'diff-added': span.type === 'added',
                    'diff-removed': span.type === 'removed',
                    'diff-restructured': span.type === 'restructured'
                  }"
                  @click="span.alternatives && selectSynonym(span)"
                  :title="span.original ? `Original: ${span.original}` : undefined"
                >
                  {{ span.value }}
                </span>
              </div>

              <!-- Plain View -->
              <textarea
                v-else-if="paraphraseResult"
                v-model="paraphraseResult.paraphrasedText"
                class="w-full h-full resize-none border-none focus:outline-none text-slate-800"
              ></textarea>

              <div v-else class="h-full flex items-center justify-center text-slate-400 text-sm">
                Rewritten text will appear here with highlighted differences.
              </div>
            </div>

            <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span v-if="paraphraseResult">{{ wordCount(paraphraseResult.paraphrasedText) }} words</span>
              <span v-else>0 words</span>
              <div class="flex items-center space-x-3">
                <span class="flex items-center space-x-1"><span class="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span><span>Synonyms</span></span>
                <span class="flex items-center space-x-1"><span class="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span><span>Additions</span></span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 2. GRAMMAR CHECKER VIEW -->
      <section v-else-if="activeTool === 'grammar'" class="space-y-4">
        <div class="card p-4 flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold text-slate-900">Grammar & Spell Checker</h2>
            <p class="text-xs text-slate-500">Scans for grammatical, spelling, punctuation, and style anomalies with instant corrections.</p>
          </div>
          <button
            v-if="grammarResult && grammarResult.issues.length > 0"
            @click="fixAllGrammarErrors"
            class="btn btn-primary text-xs"
          >
            Fix All ({{ grammarResult.issues.length }})
          </button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 card p-4 flex flex-col h-[520px]">
            <textarea
              v-model="grammarInput"
              placeholder="Enter text to proofread for grammatical mistakes..."
              class="flex-1 w-full resize-none border-none focus:outline-none text-base leading-relaxed"
            ></textarea>
            <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>{{ wordCount(grammarInput) }} words</span>
              <button @click="runGrammarCheck" :disabled="isLoading" class="btn btn-primary">
                {{ isLoading ? 'Checking...' : 'Check Grammar' }}
              </button>
            </div>
          </div>

          <!-- Issues Sidebar -->
          <div class="card p-4 flex flex-col h-[520px] overflow-y-auto">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100">
              <span class="text-xs font-semibold uppercase text-slate-500">Detected Issues</span>
              <span v-if="grammarResult" class="text-xs font-bold text-blue-600">{{ grammarResult.issues.length }}</span>
            </div>

            <div v-if="grammarResult && grammarResult.issues.length > 0" class="mt-3 space-y-3">
              <div
                v-for="issue in grammarResult.issues"
                :key="issue.id"
                class="p-3 rounded-lg border border-slate-200 bg-slate-50 hover:border-blue-400 transition-all text-xs"
              >
                <div class="flex items-center justify-between mb-1.5">
                  <span class="font-semibold uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                    {{ issue.category }}
                  </span>
                  <button @click="acceptGrammarCorrection(issue)" class="text-blue-600 font-bold hover:underline">Accept</button>
                </div>
                <div class="flex items-center space-x-2 my-1">
                  <span class="line-through text-red-500">{{ issue.original }}</span>
                  <span>&rarr;</span>
                  <span class="font-bold text-emerald-600">{{ issue.replacement }}</span>
                </div>
                <p class="text-slate-500 mt-1">{{ issue.explanation }}</p>
              </div>
            </div>
            <div v-else-if="grammarResult && grammarResult.issues.length === 0" class="h-full flex flex-col items-center justify-center text-slate-400 text-center">
              <span class="text-emerald-500 text-2xl font-bold mb-1">&check;</span>
              <p class="text-sm font-medium text-slate-700">No Grammar Errors Found!</p>
              <p class="text-xs text-slate-400">Your text is grammatically sound.</p>
            </div>
            <div v-else class="h-full flex items-center justify-center text-slate-400 text-sm">
              Run proofreading to see detected issues.
            </div>
          </div>
        </div>
      </section>

      <!-- 3. AI HUMANIZER VIEW -->
      <section v-else-if="activeTool === 'humanize'" class="space-y-4">
        <div class="card p-4 flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold text-slate-900">AI Humanizer</h2>
            <p class="text-xs text-slate-500">Injects natural burstiness and removes robotic AI signposts to enhance organic readability.</p>
          </div>
          <div class="flex items-center space-x-2">
            <span class="text-xs text-slate-500">Style:</span>
            <select v-model="humanizeLevel" class="text-xs border border-slate-300 rounded px-2 py-1">
              <option value="conversational">Conversational</option>
              <option value="natural">Natural & Balanced</option>
              <option value="engaging">Engaging & Expressive</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="card p-4 flex flex-col h-[520px]">
            <textarea
              v-model="humanizeInput"
              placeholder="Paste AI-generated or stiff text here..."
              class="flex-1 w-full resize-none border-none focus:outline-none text-base leading-relaxed"
            ></textarea>
            <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>{{ wordCount(humanizeInput) }} words</span>
              <button @click="runHumanize" :disabled="isLoading" class="btn btn-primary">
                {{ isLoading ? 'Humanizing...' : 'Humanize Text' }}
              </button>
            </div>
          </div>

          <div class="card p-4 flex flex-col h-[520px]">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100">
              <span class="text-xs font-semibold uppercase text-slate-500">Humanized Result</span>
              <div v-if="humanizeResult" class="flex items-center space-x-2 text-xs">
                <span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">Flow: {{ humanizeResult.readabilityScore.flowScore }}%</span>
                <span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800">Burstiness: {{ humanizeResult.readabilityScore.burstiness }}</span>
              </div>
            </div>
            <textarea
              v-if="humanizeResult"
              v-model="humanizeResult.humanizedText"
              class="flex-1 w-full mt-3 resize-none border-none focus:outline-none text-base leading-relaxed"
            ></textarea>
            <div v-else class="h-full flex items-center justify-center text-slate-400 text-sm">
              Refined humanized text will appear here.
            </div>
          </div>
        </div>
      </section>

      <!-- 4. SUMMARIZER VIEW -->
      <section v-else-if="activeTool === 'summarize'" class="space-y-4">
        <div class="card p-4 flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center space-x-3">
            <span class="text-xs font-semibold uppercase text-slate-500">Format:</span>
            <button
              @click="summarizeFormat = 'paragraph'"
              :class="[summarizeFormat === 'paragraph' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700', 'px-3 py-1.5 text-xs rounded-md font-medium']"
            >
              Paragraph
            </button>
            <button
              @click="summarizeFormat = 'bullet'"
              :class="[summarizeFormat === 'bullet' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700', 'px-3 py-1.5 text-xs rounded-md font-medium']"
            >
              Bullet Points
            </button>
          </div>

          <div class="flex items-center space-x-2">
            <span class="text-xs font-semibold uppercase text-slate-500">Length:</span>
            <select v-model="summarizeLength" class="text-xs border border-slate-300 rounded px-2.5 py-1.5">
              <option value="short">Short (1-2 sentences)</option>
              <option value="medium">Medium (Balanced)</option>
              <option value="long">Long (Detailed)</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="card p-4 flex flex-col h-[520px]">
            <textarea
              v-model="summarizeInput"
              placeholder="Paste article, report, or essay to condense..."
              class="flex-1 w-full resize-none border-none focus:outline-none text-base leading-relaxed"
            ></textarea>
            <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>{{ wordCount(summarizeInput) }} words</span>
              <button @click="runSummarize" :disabled="isLoading" class="btn btn-primary">
                {{ isLoading ? 'Summarizing...' : 'Summarize' }}
              </button>
            </div>
          </div>

          <div class="card p-4 flex flex-col h-[520px]">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100">
              <span class="text-xs font-semibold uppercase text-slate-500">Summary</span>
              <span v-if="summarizeResult" class="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">
                {{ Math.round(summarizeResult.reductionRatio * 100) }}% Reduced
              </span>
            </div>
            <textarea
              v-if="summarizeResult"
              v-model="summarizeResult.summary"
              class="flex-1 w-full mt-3 resize-none border-none focus:outline-none text-base leading-relaxed"
            ></textarea>
            <div v-else class="h-full flex items-center justify-center text-slate-400 text-sm">
              Condensed summary will render here.
            </div>
          </div>
        </div>
      </section>

      <!-- 5. TRANSLATOR VIEW -->
      <section v-else-if="activeTool === 'translate'" class="space-y-4">
        <div class="card p-4 flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <select v-model="sourceLang" class="text-xs border border-slate-300 rounded px-2.5 py-1.5">
              <option value="auto">Auto-Detect</option>
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="zh">Chinese</option>
              <option value="hi">Hindi</option>
            </select>
            <button @click="swapLanguages" class="text-slate-400 hover:text-slate-700 text-sm font-bold">&harr;</button>
            <select v-model="targetLang" class="text-xs border border-slate-300 rounded px-2.5 py-1.5">
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="en">English</option>
              <option value="zh">Chinese</option>
              <option value="hi">Hindi</option>
              <option value="ja">Japanese</option>
              <option value="ar">Arabic</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="card p-4 flex flex-col h-[520px]">
            <textarea
              v-model="translateInput"
              placeholder="Type or paste text to translate..."
              class="flex-1 w-full resize-none border-none focus:outline-none text-base leading-relaxed"
            ></textarea>
            <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>{{ wordCount(translateInput) }} words</span>
              <button @click="runTranslate" :disabled="isLoading" class="btn btn-primary">
                {{ isLoading ? 'Translating...' : 'Translate' }}
              </button>
            </div>
          </div>

          <div class="card p-4 flex flex-col h-[520px]">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100">
              <span class="text-xs font-semibold uppercase text-slate-500">Translation</span>
              <span v-if="translateResult" class="text-xs text-blue-600">Detected: {{ translateResult.detectedSourceLang }}</span>
            </div>
            <textarea
              v-if="translateResult"
              v-model="translateResult.translatedText"
              class="flex-1 w-full mt-3 resize-none border-none focus:outline-none text-base leading-relaxed"
            ></textarea>
            <div v-else class="h-full flex items-center justify-center text-slate-400 text-sm">
              Translation will render here.
            </div>
          </div>
        </div>
      </section>

      <!-- 6. ORIGINALITY SUITE (AI DETECTOR / PLAGIARISM / CITATION) -->
      <section v-else-if="activeTool === 'originality'" class="space-y-4">
        <div class="card p-4 flex items-center space-x-3">
          <button
            v-for="sub in (['detector', 'plagiarism', 'citation'] as const)"
            :key="sub"
            @click="originalitySubTool = sub"
            :class="[
              originalitySubTool === sub ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700',
              'px-3.5 py-1.5 text-xs font-medium rounded-md capitalize'
            ]"
          >
            {{ sub === 'detector' ? 'AI Detector' : sub === 'plagiarism' ? 'Plagiarism Checker' : 'Citation Generator' }}
          </button>
        </div>

        <!-- AI Detector Subview -->
        <div v-if="originalitySubTool === 'detector'" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="card p-4 flex flex-col h-[500px]">
            <textarea
              v-model="detectorInput"
              placeholder="Paste text (minimum 50 characters) to analyze AI probability..."
              class="flex-1 w-full resize-none border-none focus:outline-none text-base leading-relaxed"
            ></textarea>
            <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>{{ wordCount(detectorInput) }} words</span>
              <button @click="runDetector" :disabled="isLoading" class="btn btn-primary">
                {{ isLoading ? 'Analyzing...' : 'Scan for AI' }}
              </button>
            </div>
          </div>

          <div class="card p-4 flex flex-col h-[500px] overflow-y-auto">
            <div v-if="detectorResult" class="space-y-4">
              <div class="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <div class="text-2xl font-extrabold" :class="detectorResult.aiPercentage > 60 ? 'text-red-600' : 'text-emerald-600'">
                    {{ detectorResult.aiPercentage }}% AI Likelihood
                  </div>
                  <p class="text-xs text-slate-500">{{ detectorResult.overallVerdict }} ({{ detectorResult.confidence }} Confidence)</p>
                </div>
                <div class="text-right text-xs text-slate-500 space-y-1">
                  <div>Perplexity: {{ detectorResult.metrics.perplexityScore }}/100</div>
                  <div>Burstiness: {{ detectorResult.metrics.burstinessScore }}/100</div>
                </div>
              </div>

              <!-- Sentence Heatmap -->
              <div class="space-y-2">
                <span class="text-xs font-semibold uppercase text-slate-500">Sentence Analysis</span>
                <div class="space-y-1.5 text-sm leading-relaxed">
                  <span
                    v-for="(sent, idx) in detectorResult.sentences"
                    :key="idx"
                    :class="[
                      sent.flag === 'ai' ? 'bg-red-100 text-red-900 border-b border-red-300' :
                      sent.flag === 'mixed' ? 'bg-amber-100 text-amber-900 border-b border-amber-300' :
                      'text-slate-800',
                      'inline mr-1 px-1 py-0.5 rounded'
                    ]"
                  >
                    {{ sent.text }}
                  </span>
                </div>
              </div>

              <div class="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-800 text-[11px] leading-relaxed">
                {{ detectorResult.disclaimer }}
              </div>
            </div>
            <div v-else class="h-full flex items-center justify-center text-slate-400 text-sm">
              Scan text to see sentence-by-sentence AI likelihood heatmap.
            </div>
          </div>
        </div>

        <!-- Citation Generator Subview -->
        <div v-else-if="originalitySubTool === 'citation'" class="card p-6 space-y-4 max-w-3xl mx-auto">
          <h3 class="text-base font-bold text-slate-900">Academic Citation Generator</h3>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Citation Style</label>
              <select v-model="citationStyle" class="w-full text-xs border border-slate-300 rounded px-3 py-2">
                <option value="APA">APA (7th edition)</option>
                <option value="MLA">MLA (9th edition)</option>
                <option value="Chicago">Chicago (17th edition)</option>
                <option value="Harvard">Harvard</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Source Type</label>
              <select v-model="citationType" class="w-full text-xs border border-slate-300 rounded px-3 py-2">
                <option value="website">Website / Online Article</option>
                <option value="journal">Peer-Reviewed Journal</option>
                <option value="book">Book / Publication</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Article or Book Title</label>
            <input v-model="citationTitle" type="text" placeholder="Title of the work" class="w-full text-sm border border-slate-300 rounded px-3 py-2" />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Author(s)</label>
              <input v-model="citationAuthor" type="text" placeholder="E.g., Kaiming He, John Smith" class="w-full text-sm border border-slate-300 rounded px-3 py-2" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Year of Publication</label>
              <input v-model="citationYear" type="text" placeholder="2026" class="w-full text-sm border border-slate-300 rounded px-3 py-2" />
            </div>
          </div>

          <button @click="runGenerateCitation" class="btn btn-primary w-full text-sm">
            Generate Citation
          </button>

          <div v-if="citationResult" class="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3 mt-4 text-xs">
            <div>
              <span class="font-bold text-slate-500 uppercase tracking-wider text-[10px] block mb-1">In-Text Citation:</span>
              <p class="font-mono bg-white p-2 rounded border border-slate-200 select-all">{{ citationResult.inTextCitation }}</p>
            </div>
            <div>
              <span class="font-bold text-slate-500 uppercase tracking-wider text-[10px] block mb-1">Full Bibliography Entry:</span>
              <p class="font-mono bg-white p-2 rounded border border-slate-200 select-all">{{ citationResult.fullBibliographyEntry }}</p>
            </div>
          </div>
        </div>

        <!-- Plagiarism Checker Subview -->
        <div v-else class="card p-6 max-w-3xl mx-auto space-y-4">
          <h3 class="text-base font-bold text-slate-900">Plagiarism Similarity Scanner</h3>
          <textarea
            v-model="plagiarismInput"
            placeholder="Paste text to scan against academic corpora..."
            class="w-full h-48 border border-slate-300 rounded-lg p-3 text-sm resize-none focus:outline-none"
          ></textarea>
          <button @click="runPlagiarismCheck" :disabled="isLoading" class="btn btn-primary w-full">
            {{ isLoading ? 'Checking Databases...' : 'Check Plagiarism' }}
          </button>

          <div v-if="plagiarismResult" class="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm font-bold">Similarity Index:</span>
              <span :class="plagiarismResult.similarityScore > 20 ? 'text-red-600 font-extrabold' : 'text-emerald-600 font-extrabold'">
                {{ plagiarismResult.similarityScore }}% Matched
              </span>
            </div>
            <div v-if="plagiarismResult.matchedSources.length > 0" class="space-y-2 mt-2">
              <span class="text-xs font-semibold text-slate-500">Matched Sources:</span>
              <div v-for="(src, i) in plagiarismResult.matchedSources" :key="i" class="p-2 bg-white rounded border border-slate-200 text-xs">
                <a :href="src.url" target="_blank" class="text-blue-600 font-semibold hover:underline block">{{ src.title }}</a>
                <p class="text-slate-500 mt-1">"{{ src.matchedText }}"</p>
              </div>
            </div>
            <div v-else class="text-xs text-emerald-600 font-medium">
              Zero identical matches found in verified index.
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- Slide-over AI Chat Panel -->
    <div
      v-if="openChat"
      class="fixed inset-y-0 right-0 w-96 bg-white border-l border-slate-200 shadow-2xl z-40 flex flex-col"
    >
      <div class="p-4 border-b border-slate-200 flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <div class="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">AI</div>
          <span class="font-bold text-sm text-slate-800">Writing Assistant</span>
        </div>
        <button @click="openChat = false" class="text-slate-400 hover:text-slate-600 text-lg">&times;</button>
      </div>

      <div class="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
        <div
          v-for="(msg, i) in chatMessages"
          :key="i"
          :class="[
            msg.role === 'user' ? 'bg-blue-600 text-white ml-6 rounded-br-none' : 'bg-slate-100 text-slate-800 mr-6 rounded-bl-none',
            'p-3 rounded-xl leading-relaxed whitespace-pre-wrap'
          ]"
        >
          {{ msg.content }}
        </div>
      </div>

      <div class="p-3 border-t border-slate-200 bg-slate-50">
        <div class="flex space-x-1.5 mb-2 overflow-x-auto pb-1">
          <button @click="sendQuickChat('Critique tone and clarity')" class="text-[10px] px-2 py-1 bg-white border border-slate-200 rounded-full text-slate-600 hover:bg-slate-100 whitespace-nowrap">
            Critique Tone
          </button>
          <button @click="sendQuickChat('Brainstorm 3 titles')" class="text-[10px] px-2 py-1 bg-white border border-slate-200 rounded-full text-slate-600 hover:bg-slate-100 whitespace-nowrap">
            Suggest Titles
          </button>
        </div>
        <div class="flex space-x-2">
          <input
            v-model="chatInput"
            @keyup.enter="sendChatMessage"
            type="text"
            placeholder="Ask AI writing assistant..."
            class="flex-1 text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
          />
          <button @click="sendChatMessage" class="btn btn-primary text-xs px-3 py-2">
            Send
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { writingApi } from './api';

// Active Tool State
const activeTool = ref<'paraphrase' | 'grammar' | 'humanize' | 'summarize' | 'translate' | 'originality'>('paraphrase');
const backendHealthy = ref(false);
const isLoading = ref(false);
const copySuccess = ref(false);
const viewMode = ref<'rich' | 'plain'>('rich');
const errorMessage = ref('');
const isMockMode = ref(false);
const activeProvider = ref('MOCK');

// Navigation Tools
const tools: { id: 'paraphrase' | 'grammar' | 'humanize' | 'summarize' | 'translate' | 'originality'; name: string }[] = [
  { id: 'paraphrase', name: 'Paraphraser' },
  { id: 'grammar', name: 'Grammar Checker' },
  { id: 'humanize', name: 'AI Humanizer' },
  { id: 'summarize', name: 'Summarizer' },
  { id: 'translate', name: 'Translator' },
  { id: 'originality', name: 'Originality & Citations' }
];

// Paraphraser State
const paraphraseModes = [
  { id: 'standard', label: 'Standard' },
  { id: 'fluency', label: 'Fluency' },
  { id: 'formal', label: 'Formal' },
  { id: 'academic', label: 'Academic' },
  { id: 'simple', label: 'Simple' },
  { id: 'creative', label: 'Creative' },
  { id: 'expand', label: 'Expand' },
  { id: 'shorten', label: 'Shorten' },
  { id: 'custom', label: 'Custom' }
];
const chosenMode = ref('standard');
const synonymStrength = ref(2);
const customInstruction = ref('');
const inputText = ref('The industry is booming and we are getting close to achieving Fortune 500 status, as there are more requests to research new customers.');
const paraphraseResult = ref<any>(null);

// Grammar State
const grammarInput = ref('Teh results of the experiment was completely unexpected because nobody checked teh calibration.');
const grammarResult = ref<any>(null);

// Humanizer State
const humanizeInput = ref('Furthermore, it is crucial to remember that delving into this technological tapestry serves as a beacon of our innovation.');
const humanizeLevel = ref('natural');
const humanizeResult = ref<any>(null);

// Summarizer State
const summarizeInput = ref('Artificial intelligence has fundamentally evolved from symbolic expert systems to statistical deep learning architectures. Large foundation models trained on web-scale datasets now demonstrate unprecedented capabilities in reasoning, creative synthesis, and document translation. Consequently, enterprises across legal, healthcare, and educational sectors are rapidly restructuring their core operational workflows to integrate generative AI capabilities.');
const summarizeFormat = ref<'paragraph' | 'bullet'>('bullet');
const summarizeLength = ref<'short' | 'medium' | 'long'>('medium');
const summarizeResult = ref<any>(null);

// Translator State
const translateInput = ref('Welcome to ShivQuill, the production-grade AI writing platform.');
const sourceLang = ref('auto');
const targetLang = ref('es');
const translateResult = ref<any>(null);

// Originality State
const originalitySubTool = ref<'detector' | 'plagiarism' | 'citation'>('detector');
const detectorInput = ref('Furthermore, it is important to remember that utilizing advanced algorithms provides a testament to our system capabilities.');
const detectorResult = ref<any>(null);
const plagiarismInput = ref('Artificial intelligence is intelligence demonstrated by machines, as opposed to the natural intelligence displayed by animals including humans.');
const plagiarismResult = ref<any>(null);

// Citation Form State
const citationStyle = ref('APA');
const citationType = ref('journal');
const citationTitle = ref('Deep Residual Learning for Image Recognition');
const citationAuthor = ref('Kaiming He');
const citationYear = ref('2016');
const citationResult = ref<any>(null);

// Chat Assistant State
const openChat = ref(false);
const chatInput = ref('');
const chatMessages = ref([
  { role: 'assistant', content: 'Hello! I am your AI writing companion. Ask me to brainstorm ideas, improve transitions, or rephrase complex paragraphs!' }
]);

// Utility: Word Counter
const wordCount = (text: string) => (text ? text.trim().split(/\s+/).filter(Boolean).length : 0);

// API Execution Handlers
const runParaphrase = async () => {
  if (!inputText.value.trim()) return;
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const res = await writingApi.paraphrase({
      text: inputText.value,
      mode: chosenMode.value,
      synonymStrength: synonymStrength.value,
      customInstruction: customInstruction.value
    });
    paraphraseResult.value = res.data;
  } catch (err: any) {
    errorMessage.value = err.response?.data?.error || err.message || 'Paraphrase request failed';
  } finally {
    isLoading.value = false;
  }
};

const runGrammarCheck = async () => {
  if (!grammarInput.value.trim()) return;
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const res = await writingApi.checkGrammar({ text: grammarInput.value });
    grammarResult.value = res.data;
  } catch (err: any) {
    errorMessage.value = err.response?.data?.error || err.message || 'Grammar check failed';
  } finally {
    isLoading.value = false;
  }
};

const acceptGrammarCorrection = (issue: any) => {
  grammarInput.value = grammarInput.value.replace(issue.original, issue.replacement);
  grammarResult.value.issues = grammarResult.value.issues.filter((i: any) => i.id !== issue.id);
};

const fixAllGrammarErrors = () => {
  if (grammarResult.value?.correctedText) {
    grammarInput.value = grammarResult.value.correctedText;
    grammarResult.value.issues = [];
  }
};

const runHumanize = async () => {
  if (!humanizeInput.value.trim()) return;
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const res = await writingApi.humanize({
      text: humanizeInput.value,
      readabilityLevel: humanizeLevel.value
    });
    humanizeResult.value = res.data;
  } catch (err: any) {
    errorMessage.value = err.response?.data?.error || err.message || 'Humanize failed';
  } finally {
    isLoading.value = false;
  }
};

const runSummarize = async () => {
  if (!summarizeInput.value.trim()) return;
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const res = await writingApi.summarize({
      text: summarizeInput.value,
      format: summarizeFormat.value,
      length: summarizeLength.value
    });
    summarizeResult.value = res.data;
  } catch (err: any) {
    errorMessage.value = err.response?.data?.error || err.message || 'Summarize failed';
  } finally {
    isLoading.value = false;
  }
};

const runTranslate = async () => {
  if (!translateInput.value.trim()) return;
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const res = await writingApi.translate({
      text: translateInput.value,
      sourceLang: sourceLang.value,
      targetLang: targetLang.value
    });
    translateResult.value = res.data;
  } catch (err: any) {
    errorMessage.value = err.response?.data?.error || err.message || 'Translate failed';
  } finally {
    isLoading.value = false;
  }
};

const swapLanguages = () => {
  if (sourceLang.value !== 'auto') {
    const temp = sourceLang.value;
    sourceLang.value = targetLang.value;
    targetLang.value = temp;
  }
};

const runDetector = async () => {
  if (!detectorInput.value.trim()) return;
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const res = await writingApi.aiDetector(detectorInput.value);
    detectorResult.value = res.data;
  } catch (err: any) {
    errorMessage.value = err.response?.data?.error || err.message || 'AI detection failed';
  } finally {
    isLoading.value = false;
  }
};

const runPlagiarismCheck = async () => {
  if (!plagiarismInput.value.trim()) return;
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const res = await writingApi.checkPlagiarism(plagiarismInput.value);
    plagiarismResult.value = res.data;
  } catch (err: any) {
    errorMessage.value = err.response?.data?.error || err.message || 'Plagiarism check failed';
  } finally {
    isLoading.value = false;
  }
};

const runGenerateCitation = async () => {
  errorMessage.value = '';
  try {
    const res = await writingApi.generateCitation({
      style: citationStyle.value,
      sourceType: citationType.value,
      title: citationTitle.value,
      authors: [citationAuthor.value],
      year: citationYear.value
    });
    citationResult.value = res.data;
  } catch (err: any) {
    errorMessage.value = err.response?.data?.error || err.message || 'Citation generation failed';
  }
};

const sendChatMessage = async () => {
  if (!chatInput.value.trim()) return;
  const userText = chatInput.value.trim();
  chatMessages.value.push({ role: 'user', content: userText });
  chatInput.value = '';
  errorMessage.value = '';

  try {
    const res = await writingApi.chat(chatMessages.value, inputText.value);
    chatMessages.value.push({ role: 'assistant', content: res.data.content });
  } catch (err: any) {
    errorMessage.value = err.response?.data?.error || err.message || 'Chat assistant failed';
  }
};

const sendQuickChat = (prompt: string) => {
  chatInput.value = prompt;
  sendChatMessage();
};

const copyToClipboard = (text?: string) => {
  if (!text) return;
  navigator.clipboard.writeText(text);
  copySuccess.value = true;
  setTimeout(() => (copySuccess.value = false), 2000);
};

const selectSynonym = (span: any) => {
  if (span.alternatives && span.alternatives.length > 0) {
    const nextIndex = (span.alternatives.indexOf(span.value) + 1) % span.alternatives.length;
    span.value = span.alternatives[nextIndex];
  }
};

const loadSample = (type: string) => {
  if (type === 'academic') {
    inputText.value = 'Empirical observations demonstrate that metabolic variances correlate significantly with cellular respiration metrics (Smith et al., 2024, p. 112). A two-tailed t-test revealed p < 0.01, establishing quantitative significance across the sample population.';
  }
};

onMounted(async () => {
  try {
    const health = await writingApi.checkHealth();
    if (health.data?.status === 'healthy') {
      backendHealthy.value = true;
      isMockMode.value = !!health.data.isMockMode;
      activeProvider.value = health.data.provider || 'UNKNOWN';
    }
  } catch (err: any) {
    console.warn('Backend connecting...', err);
  }
});
</script>
