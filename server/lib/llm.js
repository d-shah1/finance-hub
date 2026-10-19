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

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`AI provider returned ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

export async function complete(system, user) {
  const provider = activeProvider();
  const { ai } = config;
  if (provider === 'groq') {
    const json = await postJson(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: ai.groqModel,
        temperature: 0.4,
        max_tokens: 1500,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      { Authorization: `Bearer ${ai.groqKey}` }
    );
    return { provider: `Groq · ${ai.groqModel}`, text: json.choices?.[0]?.message?.content || '' };
  }
  if (provider === 'gemini') {
    const json = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${ai.geminiModel}:generateContent`,
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
      },
      { 'x-goog-api-key': ai.geminiKey }
    );
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    return { provider: `Gemini · ${ai.geminiModel}`, text };
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
