import { config } from '../config.js';

/**
 * Free AI providers. Groq and Google Gemini both have free API tiers (no card needed);
 * Ollama runs open models locally for free. Returns null provider when none is configured,
 * in which case the app falls back to its built-in rule-based advisor.
 */
export function activeProvider() {
  const { provider, groqKey, geminiKey, ollamaUrl } = config.ai;
  if (provider === 'none') return null;
  if (provider === 'groq') return groqKey ? 'groq' : null;
  if (provider === 'gemini') return geminiKey ? 'gemini' : null;
  if (provider === 'ollama') return ollamaUrl ? 'ollama' : null;
  if (groqKey) return 'groq';
  if (geminiKey) return 'gemini';
  if (ollamaUrl) return 'ollama';
  return null;
}

// Tried in order after the configured model when a provider says a model no longer exists.
// Free-tier models get retired (Groq shut down llama-3.3-70b-versatile in August 2026).
const GROQ_FALLBACKS = ['openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'openai/gpt-oss-20b'];
const GEMINI_FALLBACKS = ['gemini-flash-latest', 'gemini-2.5-flash'];

class ProviderError extends Error {
  constructor(status, body) {
    super(`AI provider returned ${status}: ${body.slice(0, 300)}`);
    this.status = status;
    // 404s and "decommissioned"/"not found" messages mean the model itself is gone; try another.
    this.modelGone = status === 404 || /model_not_found|decommissioned|does not exist|not found|not supported/i.test(body);
  }
}

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  if (!res.ok) throw new ProviderError(res.status, text);
  return JSON.parse(text);
}

// The model that last worked, per provider, so later requests skip retired ones.
const working = {};

/** Calls `run(model)` with the configured model, then each fallback while the model is reported as gone. */
async function withFallbacks(provider, configured, fallbacks, run) {
  const models = [...new Set([working[provider], configured, ...fallbacks].filter(Boolean))];
  let lastError;
  for (const model of models) {
    try {
      const text = await run(model);
      if (!text?.trim()) throw new Error(`${model} returned an empty answer`);
      if (model !== configured && working[provider] !== model) {
        console.warn(`[ai] ${provider} model "${configured}" is unavailable; using "${model}". Set ${provider.toUpperCase()}_MODEL to silence this.`);
      }
      working[provider] = model;
      return { model, text };
    } catch (e) {
      lastError = e;
      if (!(e instanceof ProviderError && e.modelGone)) throw e;
      if (working[provider] === model) delete working[provider];
    }
  }
  throw lastError;
}

export async function complete(system, user) {
  const provider = activeProvider();
  const { ai } = config;
  if (provider === 'groq') {
    const out = await withFallbacks('groq', ai.groqModel, GROQ_FALLBACKS, async (model) => {
      const reasoning = model.startsWith('openai/gpt-oss');
      const json = await postJson(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model,
          temperature: 0.4,
          // Reasoning models spend part of the budget thinking; keep that short and leave room for the answer.
          max_completion_tokens: reasoning ? 4000 : 1500,
          ...(reasoning ? { reasoning_effort: 'low', include_reasoning: false } : {}),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        },
        { Authorization: `Bearer ${ai.groqKey}` }
      );
      return json.choices?.[0]?.message?.content || '';
    });
    return { provider: `Groq · ${out.model}`, text: out.text };
  }
  if (provider === 'gemini') {
    const out = await withFallbacks('gemini', ai.geminiModel, GEMINI_FALLBACKS, async (model) => {
      const json = await postJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 4000 },
        },
        { 'x-goog-api-key': ai.geminiKey }
      );
      return json.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    });
    return { provider: `Gemini · ${out.model}`, text: out.text };
  }
  if (provider === 'ollama') {
    const json = await postJson(`${ai.ollamaUrl.replace(/\/$/, '')}/api/chat`, {
      model: ai.ollamaModel,
      stream: false,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    return { provider: `Ollama · ${ai.ollamaModel}`, text: json.message?.content || '' };
  }
  throw new Error('No AI provider configured');
}
