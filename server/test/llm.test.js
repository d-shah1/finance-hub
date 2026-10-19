import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.GROQ_API_KEY = 'test-key';
process.env.GROQ_MODEL = 'llama-3.3-70b-versatile'; // what older .env files still say

const { complete } = await import('../lib/llm.js');

function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push(body);
    const [status, json] = handler(body);
    return { ok: status < 400, status, text: async () => JSON.stringify(json) };
  };
  return calls;
}

const GONE = { error: { message: 'The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.', type: 'invalid_request_error', code: 'model_not_found' } };

test('a retired Groq model falls back to a current one', async () => {
  const calls = mockFetch((b) => (b.model === 'llama-3.3-70b-versatile' ? [404, GONE] : [200, { choices: [{ message: { content: '## Snapshot\nAll good.' } }] }]));
  const out = await complete('sys', 'user');
  assert.equal(out.text, '## Snapshot\nAll good.');
  assert.equal(out.provider, 'Groq · openai/gpt-oss-120b');
  assert.deepEqual(calls.map((c) => c.model), ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b']);
  // Reasoning model: short thinking, answer only.
  assert.equal(calls[1].reasoning_effort, 'low');
  assert.equal(calls[1].include_reasoning, false);

  // The working model is remembered, so the next request goes straight to it.
  const again = mockFetch(() => [200, { choices: [{ message: { content: 'ok' } }] }]);
  await complete('sys', 'user');
  assert.deepEqual(again.map((c) => c.model), ['openai/gpt-oss-120b']);
});

test('other errors (e.g. rate limits) are reported, not retried on every model', async () => {
  const calls = mockFetch(() => [429, { error: { message: 'Rate limit reached' } }]);
  await assert.rejects(complete('sys', 'user'), /429/);
  assert.equal(calls.length, 1);
});
