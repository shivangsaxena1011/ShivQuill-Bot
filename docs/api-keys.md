# API keys

ShivQuill reads its keys from environment variables. Locally they live in the project-root `.env`
(git-ignored). On Render they are set in the dashboard. Keys are never sent to the browser.

| What it powers | Variable(s) | Needed? | Where to get it |
| --- | --- | --- | --- |
| AI tools: AI detector, paraphraser, grammar, summarizer, translator, tone, chat | `REQUEST_TYPE` + one of `GROQ_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or `CUSTOM_API_BASE_URL` (+ `CUSTOM_API_KEY`) | **Yes** (one provider) | Groq (free tier): https://console.groq.com/keys · OpenAI: https://platform.openai.com/api-keys · OpenRouter: https://openrouter.ai/keys · Custom: any OpenAI-compatible server (Ollama, vLLM, LM Studio) |
| Model choice (optional) | `GROQ_MODEL`, `OPENAI_MODEL`, `OPENROUTER_MODEL`, `CUSTOM_API_MODEL` | No | Defaults: `openai/gpt-oss-120b`, `gpt-4o-mini`, `meta-llama/llama-3.3-70b-instruct` |
| Plagiarism: reliable full-web search | `GOOGLE_CSE_KEY` + `GOOGLE_CSE_ID`, or `BRAVE_SEARCH_API_KEY`, or `SEARXNG_URL` | No. Without them, free DuckDuckGo results are used, which can be throttled on shared servers | Google Programmable Search (100 free queries/day): https://developers.google.com/custom-search/v1/overview and create a search engine for "the entire web" at https://programmablesearchengine.google.com · Brave Search API (free plan): https://brave.com/search/api/ · SearXNG (self-hosted, enable JSON output) |
| Plagiarism: scholarly search without anonymous rate limits | `OPENALEX_API_KEY` | No (recommended) | https://openalex.org/rest-api (free) |
| Polite API identification | `PLAGIARISM_CONTACT`, `CROSSREF_MAILTO` | No | Your email or project URL |

## Local setup (recommended)

```bash
npm run setup:keys
```

The script:

- asks for each key, hides what you type, and shows `*` instead;
- keeps the current value when you press Enter, and clears it when you type `-`;
- updates only the lines it changes in `.env`, keeping every other line and comment, and saves the old file as `.env.bak` (git-ignored);
- can test the AI key with a single request to the provider.

To see which keys are set (masked) without changing anything:

```bash
npm run check:keys
```

Restart the server after changing keys (`npm start` or `npm run dev:backend`). The root `.env` is used
whether the server starts from the project root or from `backend/`.

The test suite always runs offline in mock mode, even when real keys are saved. To run the live provider
check on purpose, use `LIVE_PROVIDER_TESTS=1 npm --prefix backend test`.

## Render (production)

1. Open https://dashboard.render.com, then the **shivquill** service, then **Environment**.
2. Click **Add Environment Variable** for each key you want, for example:
   - `REQUEST_TYPE` = `GROQ` and `GROQ_API_KEY` = your key
   - `OPENALEX_API_KEY` = your OpenAlex key
   - `BRAVE_SEARCH_API_KEY` = your Brave key, or `GOOGLE_CSE_KEY` and `GOOGLE_CSE_ID`
3. Click **Save Changes**. Render redeploys the service with the new values.

Never put real keys in `render.yaml`, `.env.example` or any committed file.

## Check what the server is using

Open `/api/health` (for example https://shivquill.onrender.com/api/health). It shows:

- `provider` and `providerStatus` for the AI model;
- `plagiarismSearch.sources`, the plagiarism search sources that are enabled;
- `plagiarismSearch.openAlexKey`, `true` when the OpenAlex key is set.

It reports names only, never key values.
