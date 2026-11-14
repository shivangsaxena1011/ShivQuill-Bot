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
            <span class="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">AI Platform v2.1</span>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <nav class="hidden lg:flex space-x-1">
          <button
            v-for="tool in tools"
            :key="tool.id"
            @click="activeTool = tool.id"
            :class="[
              activeTool === tool.id
                ? 'bg-blue-50 text-blue-700 border-blue-600 font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-transparent',
              'px-3 py-2 text-xs font-medium rounded-lg border-b-2 transition-all flex items-center space-x-1'
            ]"
          >
            <span>{{ tool.name }}</span>
          </button>
        </nav>

        <!-- Right Side Health & Settings -->
        <div class="flex items-center space-x-3">
          <div class="flex items-center space-x-1.5 text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
            <span :class="[
              'w-2.5 h-2.5 rounded-full',
              engineStatus === 'active' ? 'bg-emerald-500 animate-pulse' :
              engineStatus === 'mock_test' ? 'bg-amber-500' : 'bg-red-500'
            ]"></span>
            <span class="font-medium">
              {{ 
                engineStatus === 'active' ? `Engine: ${activeProvider} (${activeModel})` :
                engineStatus === 'mock_test' ? 'Engine: Test Mock (Simulation Mode)' :
                'Engine: Unconfigured (Set API Key)'
              }}
            </span>
          </div>
          <button @click="openChat = !openChat" class="btn btn-outline text-xs px-3 py-1.5 flex items-center space-x-1">
            <span>AI Chat Assistant</span>
          </button>
        </div>
      </div>
    </header>

    <!-- Main Workspace Container -->
    <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <!-- Unconfigured Engine Notice Banner -->
      <div v-if="engineStatus === 'unconfigured'" class="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center justify-between shadow-sm">
        <div class="flex items-center space-x-3">
          <span class="text-base font-bold text-amber-700">&triangle;</span>
          <div>
            <span class="font-bold">No AI Provider Configured:</span>
            <span> Configure <code>GROQ_API_KEY</code>, <code>OPENAI_API_KEY</code>, or set <code>REQUEST_TYPE=MOCK</code> in <code>.env</code> strictly for offline test suites. Production requires a live provider.</span>
          </div>
        </div>
      </div>

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
            placeholder="E.g., Rewrite in a humorous tone, make it sound like an executive memo..."
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
                <button @click="loadSample('academic')" class="text-xs text-blue-600 hover:underline">Academic Sample</button>
                <button @click="loadSample('long')" class="text-xs text-blue-600 hover:underline">Long Article</button>
                <button @click="inputText = ''" class="text-xs text-slate-400 hover:text-red-500">Clear</button>
              </div>
            </div>
            <textarea
              v-model="inputText"
              placeholder="Paste or type text here to paraphrase (supports large documents without artificial paywall caps)..."
              class="flex-1 w-full mt-3 resize-none border-none focus:outline-none text-slate-800 text-base leading-relaxed"
            ></textarea>
            <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>{{ wordCount(inputText) }} words | {{ inputText.length }} chars (Unlimited Length)</span>
              <button
                @click="runParaphrase"
                :disabled="isLoading || inputText.trim().length === 0"
                class="btn btn-primary"
              >
                <span v-if="isLoading">Paraphrasing...</span>
                <span v-else>Paraphrase</span>
              </button>
            </div>
          </div>

          <!-- Output Card -->
          <div class="card p-4 flex flex-col h-[520px]">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100">
              <div class="flex items-center space-x-2">
                <span class="text-xs font-semibold uppercase text-slate-500 tracking-wider">Paraphrased Output</span>
                <span v-if="paraphraseResult" class="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 capitalize font-medium">
                  {{ chosenMode }}
                </span>
                <span v-if="paraphraseResult?.semanticConsistency" class="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {{ paraphraseResult.semanticConsistency.preservationRate }}% Invariance
                </span>
                <span v-if="paraphraseResult?.partialRecovery" class="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-medium">
                  Partial Recovery
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
                    'diff-synonym cursor-pointer hover:bg-amber-200 transition-colors': span.type === 'synonym',
                    'diff-added': span.type === 'added',
                    'diff-removed': span.type === 'removed',
                    'diff-restructured': span.type === 'restructured'
                  }"
                  @click="span.alternatives && selectSynonym(span)"
                  :title="span.original ? `Original: ${span.original} (Click to cycle alternatives)` : undefined"
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
                <span class="flex items-center space-x-1"><span class="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span><span>Synonyms (Click to Cycle)</span></span>
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
            <p class="text-xs text-slate-500">Rigorous proofreading for grammar, spelling, punctuation, and structural style.</p>
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
              placeholder="Enter text to proofread for grammatical mistakes (unlimited length)..."
              class="flex-1 w-full resize-none border-none focus:outline-none text-base leading-relaxed"
            ></textarea>
            <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>{{ wordCount(grammarInput) }} words (Unlimited)</span>
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

      <!-- 3. ADVANCED WRITING SUGGESTIONS VIEW -->
      <section v-else-if="activeTool === 'suggestions'" class="space-y-4">
        <div class="card p-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 class="text-lg font-bold text-slate-900">Advanced Writing Suggestions</h2>
            <p class="text-xs text-slate-500">Actionable, context-linked suggestions for clarity, conciseness, vocabulary, and tone.</p>
          </div>
          <div class="flex items-center space-x-2">
            <span class="text-xs text-slate-500">Diagnostic Focus:</span>
            <select v-model="suggestionsFocus" class="text-xs border border-slate-300 rounded px-2.5 py-1.5">
              <option value="all">Comprehensive (All Types)</option>
              <option value="clarity">Clarity & Readability</option>
              <option value="conciseness">Conciseness & Wordiness</option>
              <option value="vocabulary">Vocabulary & Repetition</option>
              <option value="tone">Tone & Register</option>
              <option value="academic">Academic Precision</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 card p-4 flex flex-col h-[520px]">
            <textarea
              v-model="suggestionsInput"
              placeholder="Paste document to generate actionable writing suggestions (unlimited length)..."
              class="flex-1 w-full resize-none border-none focus:outline-none text-base leading-relaxed"
            ></textarea>
            <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>{{ wordCount(suggestionsInput) }} words (Unlimited)</span>
              <button @click="runSuggestions" :disabled="isLoading" class="btn btn-primary">
                {{ isLoading ? 'Analyzing...' : 'Generate Suggestions' }}
              </button>
            </div>
          </div>

          <!-- Suggestions Sidebar -->
          <div class="card p-4 flex flex-col h-[520px] overflow-y-auto">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100">
              <span class="text-xs font-semibold uppercase text-slate-500">Suggestions</span>
              <span v-if="suggestionsResult" class="text-xs font-bold text-blue-600">{{ suggestionsResult.suggestions.length }}</span>
            </div>

            <div v-if="suggestionsResult && suggestionsResult.editorialSummary" class="mt-2 p-2.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900 italic">
              "{{ suggestionsResult.editorialSummary }}"
            </div>

            <div v-if="suggestionsResult && suggestionsResult.suggestions.length > 0" class="mt-3 space-y-3">
              <div
                v-for="sug in suggestionsResult.suggestions"
                :key="sug.id"
                class="p-3 rounded-lg border border-slate-200 bg-slate-50 hover:border-blue-400 transition-all text-xs"
              >
                <div class="flex items-center justify-between mb-1.5">
                  <span class="font-semibold uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                    {{ sug.type }}
                  </span>
                  <button @click="applySuggestion(sug)" class="text-blue-600 font-bold hover:underline">Apply</button>
                </div>
                <div class="flex items-center space-x-2 my-1">
                  <span class="line-through text-slate-500">{{ sug.originalText }}</span>
                  <span>&rarr;</span>
                  <span class="font-bold text-emerald-600">{{ sug.suggestedText }}</span>
                </div>
                <p class="text-slate-500 mt-1">{{ sug.explanation }}</p>
              </div>
            </div>
            <div v-else-if="suggestionsResult && suggestionsResult.suggestions.length === 0" class="h-full flex flex-col items-center justify-center text-slate-400 text-center">
              <span class="text-emerald-500 text-2xl font-bold mb-1">&check;</span>
              <p class="text-sm font-medium text-slate-700">Writing is Crisp and Clear!</p>
              <p class="text-xs text-slate-400">No stylistic or conciseness issues detected.</p>
            </div>
            <div v-else class="h-full flex items-center justify-center text-slate-400 text-sm">
              Click 'Generate Suggestions' to receive stylistic & conciseness feedback.
            </div>
          </div>
        </div>
      </section>

      <!-- 4. AI HUMANIZER VIEW -->
      <section v-else-if="activeTool === 'humanize'" class="space-y-4">
        <div class="card p-4 flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold text-slate-900">AI Humanizer</h2>
            <p class="text-xs text-slate-500">Injects natural sentence cadence and eliminates formulaic AI clichés for organic human prose.</p>
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
              <span>{{ wordCount(humanizeInput) }} words (Unlimited)</span>
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
                <span v-if="humanizeResult.readabilityScore.fleschReadingEase" class="px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                  Flesch: {{ humanizeResult.readabilityScore.fleschReadingEase }}
                </span>
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

      <!-- 5. SUMMARIZER VIEW -->
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
              placeholder="Paste article, report, or essay to condense (unlimited length)..."
              class="flex-1 w-full resize-none border-none focus:outline-none text-base leading-relaxed"
            ></textarea>
            <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>{{ wordCount(summarizeInput) }} words (Unlimited)</span>
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

      <!-- 6. TRANSLATOR VIEW -->
      <section v-else-if="activeTool === 'translate'" class="space-y-4">
        <div class="card p-4 flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <select v-model="sourceLang" class="text-xs border border-slate-300 rounded px-2.5 py-1.5">
              <option value="auto">Auto-Detect</option>
              <option v-for="(name, code) in supportedLanguages" :key="code" :value="code">{{ name }}</option>
            </select>
            <button @click="swapLanguages" class="text-slate-400 hover:text-slate-700 text-sm font-bold">&harr;</button>
            <select v-model="targetLang" class="text-xs border border-slate-300 rounded px-2.5 py-1.5">
              <option v-for="(name, code) in supportedLanguages" :key="code" :value="code">{{ name }}</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="card p-4 flex flex-col h-[520px]">
            <textarea
              v-model="translateInput"
              placeholder="Type or paste text to translate (unlimited length)..."
              class="flex-1 w-full resize-none border-none focus:outline-none text-base leading-relaxed"
            ></textarea>
            <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>{{ wordCount(translateInput) }} words (Unlimited)</span>
              <button @click="runTranslate" :disabled="isLoading" class="btn btn-primary">
                {{ isLoading ? 'Translating...' : 'Translate' }}
              </button>
            </div>
          </div>

          <div class="card p-4 flex flex-col h-[520px]">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100">
              <span class="text-xs font-semibold uppercase text-slate-500">Translation</span>
              <span v-if="translateResult" class="text-xs text-blue-600 font-medium">Detected: {{ translateResult.detectedSourceLang }}</span>
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

      <!-- 7. ORIGINALITY SUITE (AI DETECTOR / PLAGIARISM / CITATION) -->
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
            {{ sub === 'detector' ? 'AI Detector (Experimental)' : sub === 'plagiarism' ? 'Plagiarism Scanner' : 'Citation Generator' }}
          </button>
        </div>

        <!-- AI Detector Subview -->
        <div v-if="originalitySubTool === 'detector'" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="card p-4 flex flex-col h-[500px]">
            <textarea
              v-model="detectorInput"
              placeholder="Paste text (minimum 30 characters) to evaluate statistical regularity..."
              class="flex-1 w-full resize-none border-none focus:outline-none text-base leading-relaxed"
            ></textarea>
            <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>{{ wordCount(detectorInput) }} words (Unlimited)</span>
              <button @click="runDetector" :disabled="isLoading" class="btn btn-primary">
                {{ isLoading ? 'Analyzing...' : 'Analyze Regularity' }}
              </button>
            </div>
          </div>

          <div class="card p-4 flex flex-col h-[500px] overflow-y-auto">
            <div v-if="detectorResult" class="space-y-4">
              <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="text-2xl font-extrabold" :class="detectorResult.aiPercentage > 60 ? 'text-amber-600' : 'text-emerald-600'">
                      {{ detectorResult.aiPercentage }}% Regularity Index
                    </div>
                    <p class="text-xs text-slate-500">{{ detectorResult.overallVerdict }} ({{ detectorResult.confidence }} Confidence)</p>
                  </div>
                  <div class="text-right text-xs text-slate-500 space-y-1">
                    <div>Entropy: {{ detectorResult.metrics.shannonEntropy }} bits/tok</div>
                    <div>Sentence CV: {{ detectorResult.metrics.sentenceLengthCV }}</div>
                    <div>TTR Diversity: {{ detectorResult.metrics.typeTokenRatio }}</div>
                  </div>
                </div>
              </div>

              <!-- Sentence Heatmap -->
              <div class="space-y-2">
                <span class="text-xs font-semibold uppercase text-slate-500">Sentence-Level Surface Regularity</span>
                <div class="space-y-1.5 text-sm leading-relaxed">
                  <span
                    v-for="(sent, idx) in detectorResult.sentences"
                    :key="idx"
                    :class="[
                      sent.flag === 'ai' ? 'bg-amber-100 text-amber-900 border-b-2 border-amber-400' :
                      sent.flag === 'mixed' ? 'bg-yellow-50 text-yellow-900 border-b border-yellow-300' :
                      'text-slate-800',
                      'inline mr-1 px-1 py-0.5 rounded'
                    ]"
                  >
                    {{ sent.text }}
                  </span>
                </div>
              </div>

              <!-- Explicit False-Positive Risk Warning -->
              <div class="p-3 bg-red-50 rounded-lg border border-red-200 text-red-900 text-[11px] leading-relaxed">
                <span class="font-bold">False-Positive Warning:</span> {{ detectorResult.falsePositiveRisk }}
              </div>

              <div class="p-3 bg-slate-100 rounded-lg border border-slate-200 text-slate-600 text-[11px] leading-relaxed">
                {{ detectorResult.disclaimer }}
              </div>
            </div>
            <div v-else class="h-full flex items-center justify-center text-slate-400 text-sm">
              Scan text to see linguistic entropy and sentence regularity metrics.
            </div>
          </div>
        </div>

        <!-- Citation Generator Subview -->
        <div v-else-if="originalitySubTool === 'citation'" class="card p-6 space-y-4 max-w-3xl mx-auto">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-bold text-slate-900">Academic Citation Generator</h3>
            <span v-if="citationResult?.isVerified" class="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold">
              Verified via Crossref DOI
            </span>
          </div>

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
                <option value="journal">Peer-Reviewed Journal</option>
                <option value="website">Website / Online Article</option>
                <option value="book">Book / Publication</option>
              </select>
            </div>
          </div>

          <!-- DOI Quick Lookup -->
          <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
            <label class="block text-xs font-bold text-blue-900">DOI / URL Auto-Lookup (Crossref):</label>
            <div class="flex space-x-2">
              <input 
                v-model="citationDoi" 
                type="text" 
                placeholder="E.g., 10.1145/3290605.3300267 or https://doi.org/10.1109/CVPR.2016.90" 
                class="flex-1 text-xs border border-blue-300 rounded px-3 py-1.5 focus:outline-none"
              />
              <button @click="runGenerateCitation" class="btn btn-primary text-xs px-3 py-1.5">Lookup DOI</button>
            </div>
            <p class="text-[11px] text-blue-700">Resolves official bibliographic metadata directly from Crossref without fabricating publication facts.</p>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Title of the Work</label>
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
          <div class="flex items-center justify-between">
            <h3 class="text-base font-bold text-slate-900">Plagiarism Similarity Scanner</h3>
            <span class="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200">
              Verified Open-Access Corpus
            </span>
          </div>

          <textarea
            v-model="plagiarismInput"
            placeholder="Paste text to scan against academic corpora (unlimited length)..."
            class="w-full h-48 border border-slate-300 rounded-lg p-3 text-sm resize-none focus:outline-none"
          ></textarea>
          <div class="flex items-center justify-between text-xs text-slate-500">
            <span>{{ wordCount(plagiarismInput) }} words (Unlimited)</span>
            <button @click="loadSample('plagiarism')" class="text-blue-600 hover:underline">Load Corpus Sample</button>
          </div>
          <button @click="runPlagiarismCheck" :disabled="isLoading" class="btn btn-primary w-full">
            {{ isLoading ? 'Checking Verified Index...' : 'Check Plagiarism' }}
          </button>

          <div v-if="plagiarismResult" class="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-sm font-bold">Similarity Index:</span>
                <span class="ml-2" :class="plagiarismResult.similarityScore > 20 ? 'text-red-600 font-extrabold' : 'text-emerald-600 font-extrabold'">
                  {{ plagiarismResult.similarityScore }}% Matched
                </span>
              </div>
              <span class="text-xs text-slate-500">
                Scope: {{ plagiarismResult.corpusStats?.indexedDocuments || 5 }} Indexed Documents
              </span>
            </div>

            <div v-if="plagiarismResult.matchedSources.length > 0" class="space-y-2 mt-2">
              <span class="text-xs font-semibold text-slate-600">Matched Sources:</span>
              <div v-for="(src, i) in plagiarismResult.matchedSources" :key="i" class="p-3 bg-white rounded border border-slate-200 text-xs space-y-1">
                <div class="flex items-center justify-between">
                  <a :href="src.url" target="_blank" rel="noopener noreferrer" class="text-blue-600 font-semibold hover:underline">{{ src.title }}</a>
                  <span class="text-red-600 font-bold">{{ src.matchedPercent }}% Match</span>
                </div>
                <p class="text-slate-500 text-[11px]">{{ src.authorOrSource }}</p>
                <p class="text-slate-700 bg-slate-50 p-1.5 rounded text-[11px] italic">"{{ src.matchedText }}"</p>
              </div>
            </div>
            <div v-else class="text-xs text-emerald-600 font-medium">
              Zero identical matches found in verified index.
            </div>

            <p class="text-[10px] text-slate-400 mt-2">
              {{ plagiarismResult.corpusStats?.note }}
            </p>
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
          <button @click="sendQuickChat('Improve paragraph transitions')" class="text-[10px] px-2 py-1 bg-white border border-slate-200 rounded-full text-slate-600 hover:bg-slate-100 whitespace-nowrap">
            Transitions
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
const activeTool = ref<'paraphrase' | 'grammar' | 'suggestions' | 'humanize' | 'summarize' | 'translate' | 'originality'>('paraphrase');
const engineStatus = ref<'active' | 'mock_test' | 'unconfigured'>('unconfigured');
const activeProvider = ref('GROQ');
const activeModel = ref('');
const isLoading = ref(false);
const copySuccess = ref(false);
const viewMode = ref<'rich' | 'plain'>('rich');
const errorMessage = ref('');

// Navigation Tools
const tools: { id: 'paraphrase' | 'grammar' | 'suggestions' | 'humanize' | 'summarize' | 'translate' | 'originality'; name: string }[] = [
  { id: 'paraphrase', name: 'Paraphraser' },
  { id: 'grammar', name: 'Grammar Checker' },
  { id: 'suggestions', name: 'Writing Suggestions' },
  { id: 'humanize', name: 'AI Humanizer' },
  { id: 'summarize', name: 'Summarizer' },
  { id: 'translate', name: 'Translator' },
  { id: 'originality', name: 'Originality & Citations' }
];

// Paraphraser State (All 9 QuillBot Modes)
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

// Suggestions State
const suggestionsInput = ref('In order to achieve our quarterly targets, it is very important that we utilize modern engineering pipelines.');
const suggestionsFocus = ref<'all' | 'clarity' | 'conciseness' | 'vocabulary' | 'tone' | 'academic'>('all');
const suggestionsResult = ref<any>(null);

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
const supportedLanguages: Record<string, string> = {
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  zh: 'Chinese',
  hi: 'Hindi',
  ja: 'Japanese',
  ar: 'Arabic',
  ru: 'Russian',
  pt: 'Portuguese',
  it: 'Italian',
  ko: 'Korean',
  nl: 'Dutch',
  tr: 'Turkish',
  en: 'English'
};
const translateInput = ref('Welcome to ShivQuill, the production-grade AI writing platform.');
const sourceLang = ref('auto');
const targetLang = ref('es');
const translateResult = ref<any>(null);

// Originality State
const originalitySubTool = ref<'detector' | 'plagiarism' | 'citation'>('detector');
const detectorInput = ref('Furthermore, it is important to remember that utilizing advanced algorithms provides a testament to our system capabilities.');
const detectorResult = ref<any>(null);
const plagiarismInput = ref('Deeper neural networks are more difficult to train. We present a residual learning framework to ease the training of networks.');
const plagiarismResult = ref<any>(null);

// Citation Form State
const citationStyle = ref('APA');
const citationType = ref('journal');
const citationDoi = ref('');
const citationTitle = ref('Deep Residual Learning for Image Recognition');
const citationAuthor = ref('Kaiming He');
const citationYear = ref('2016');
const citationResult = ref<any>(null);

// Chat Assistant State
const openChat = ref(false);
const chatInput = ref('');
const chatMessages = ref([
  { role: 'assistant', content: 'Hello! I am your ShivQuill writing assistant. Ask me to brainstorm ideas, critique clarity, or suggest paragraph transitions!' }
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

const runSuggestions = async () => {
  if (!suggestionsInput.value.trim()) return;
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const res = await writingApi.getSuggestions({
      text: suggestionsInput.value,
      focus: suggestionsFocus.value
    });
    suggestionsResult.value = res.data;
  } catch (err: any) {
    errorMessage.value = err.response?.data?.error || err.message || 'Suggestions request failed';
  } finally {
    isLoading.value = false;
  }
};

const applySuggestion = (sug: any) => {
  suggestionsInput.value = suggestionsInput.value.replace(sug.originalText, sug.suggestedText);
  if (suggestionsResult.value?.suggestions) {
    suggestionsResult.value.suggestions = suggestionsResult.value.suggestions.filter((s: any) => s.id !== sug.id);
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
      doi: citationDoi.value.trim() || undefined,
      title: citationTitle.value,
      authors: [citationAuthor.value],
      year: citationYear.value
    });
    citationResult.value = res.data;
    if (res.data.retrievedMetadata?.containerTitle) {
      citationTitle.value = res.data.fullBibliographyEntry.match(/\*([^*]+)\*/)?.[1] || citationTitle.value;
    }
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
  } else if (type === 'long') {
    inputText.value = 'Artificial intelligence has evolved from early rule-based expert systems into modern deep learning architectures. Large foundation models trained on web-scale textual corpora exhibit capabilities in multi-step reasoning, natural language transformation, and synthesis.\n\nModern distributed platforms require resilient architectures to handle thousands of concurrent queries per minute. Incorporating low-latency neural inference pipelines alongside strict input validation guarantees both high performance and data security for enterprise users.\n\nFurthermore, research in sequence-to-sequence neural architectures emphasizes the necessity of preserving factual invariances such as numerical metrics, formal citations, and proper nouns during stylistic rewriting.';
  } else if (type === 'plagiarism') {
    plagiarismInput.value = 'Deeper neural networks are more difficult to train. We present a residual learning framework to ease the training of networks that are substantially deeper than those used previously. We explicitly reformulate the layers as learning residual functions with reference to the layer inputs.';
  }
};

onMounted(async () => {
  try {
    const health = await writingApi.checkHealth();
    if (health.data?.status === 'healthy') {
      engineStatus.value = health.data.engineStatus || (health.data.isMockMode ? 'mock_test' : 'active');
      activeProvider.value = health.data.provider || 'UNKNOWN';
      activeModel.value = health.data.model || '';
    }
  } catch (err: any) {
    console.warn('Backend connecting...', err);
  }
});
</script>
