import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyStudio } from '../lib/coach.ts';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173';
const payload = { question: '第一次去工作室会尴尬吗？', platforms: ['小红书'], studio: emptyStudio };
function post(body, headers = {}) {
  return fetch(`${base}/api/assist`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
}
test('configuration status does not expose a secret', async () => {
  const response = await fetch(`${base}/api/assist`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(Object.keys(data), ['configured']);
  assert.equal(typeof data.configured, 'boolean');
});
test('unconfigured service explicitly returns 503, not fake AI', async t => {
  if ((await (await fetch(`${base}/api/assist`)).json()).configured) { t.skip('Do not trigger paid calls in smoke tests'); return; }
  const response = await post(payload);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /尚未配置/);
});
test('medical boundary reply is marked non-AI', async () => {
  const response = await post({ ...payload, question: '膝盖疼怎么练？' });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.answers.length, 3);
  assert.match(data.mode, /健康边界提醒/);
  assert.equal(data.sources.length, 0);
});
test('cross-origin request is rejected', async () => {
  assert.equal((await post(payload, { Origin: 'https://untrusted.example' })).status, 403);
});
test('malformed JSON and empty question are rejected', async () => {
  assert.equal((await post('{')).status, 400);
  assert.equal((await post({ ...payload, question: ' ' })).status, 400);
});
test('unsupported content type and oversized body are rejected', async () => {
  assert.equal((await post(payload, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post('a'.repeat(14001))).status, 413);
});
