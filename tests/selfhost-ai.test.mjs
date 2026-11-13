import assert from 'node:assert/strict';
import { assist, configuration, validateInput } from '../selfhost/assist.mjs';
import { asrConfiguration, attachAsr } from '../selfhost/asr.mjs';
import http from 'node:http';
import { once } from 'node:events';
import WebSocket, { WebSocketServer } from '../selfhost/node_modules/ws/wrapper.mjs';
const input = { question: '新手怎么开始？', platforms: ['抖音'], studio: { name: '', coach: '', city: '', audience: '', offer: '' } };
const config = { url: 'https://test.aliyuncs.com/compatible-mode/v1/chat/completions', key: 'fake-test-key', model: 'test' };
const output = { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ answers: ['简短', '解释', '追问'].map(title => ({ title, text: '测试回答' })) }) } }], search_info: { search_results: [{ title: '测试来源', url: 'https://example.org/source' }, { title: 'unsafe', url: 'javascript:alert(1)' }] } };
assert.equal(configuration({}), null);
assert.equal(configuration({ DASHSCOPE_BASE_URL: 'https://evil.example', DASHSCOPE_API_KEY: 'x', DASHSCOPE_MODEL: 'y' }), null);
assert.ok(configuration({ DASHSCOPE_BASE_URL: 'https://test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1', DASHSCOPE_API_KEY: 'x', DASHSCOPE_MODEL: 'y' }));
assert.deepEqual(validateInput(input), input);
for (const bad of [null, {}, { ...input, question: '' }, { ...input, studio: {} }, { ...input, question: 'x'.repeat(1501) }]) assert.throws(() => validateInput(bad));
const mock = async (url, options) => {
  assert.equal(url, config.url);
  assert.equal(options.headers.Authorization, 'Bearer fake-test-key');
  const body = JSON.parse(options.body);
  assert.equal(body.enable_search, true);
  assert.equal(body.search_options.forced_search, true);
  return Response.json(output);
};
const result = await assist(input, config, undefined, mock);
assert.equal(result.answers.length, 3); assert.equal(result.sources.length, 1);
await assert.rejects(assist(input, config, undefined, async () => Response.json({ ...output, search_info: {} })), e => e.status === 422);
await assert.rejects(assist(input, config, undefined, async () => Response.json({}, { status: 429 })), e => e.status === 502);
await assert.rejects(assist(input, config, undefined, async () => Response.json({ ...output, choices: [{ finish_reason: 'length' }] })), e => e.status === 502);
await assert.rejects(assist(input, config, undefined, async () => Response.json({ ...output, choices: [{ finish_reason: 'stop', message: { content: '{}' } }] })), e => e.status === 502);
console.log('PASS: provider config, validation, request contract, 3 answers, source filtering, missing sources, quota, truncation, malformed output (mock only; no paid requests).');
const ds = configuration({ AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'fake-ds', DEEPSEEK_MODEL: 'deepseek-flash' });
assert.equal(ds.url, 'https://api.deepseek.com/chat/completions');
assert.equal(configuration({ AI_PROVIDER: 'deepseek', DASHSCOPE_API_KEY: 'x', DASHSCOPE_MODEL: 'y', DASHSCOPE_BASE_URL: 'https://test.aliyuncs.com' }), null);
assert.equal(configuration({ AI_PROVIDER: 'unknown' }), null);
const dsResult = await assist(input, ds, undefined, async (url, options) => {
  assert.equal(url, ds.url);
  assert.equal(options.headers.Authorization, 'Bearer fake-ds');
  const request = JSON.parse(options.body);
  assert.equal(request.enable_search, undefined);
  assert.equal(request.search_options, undefined);
  assert.equal(request.response_format.type, 'json_object');
  return Response.json(output);
});
assert.equal(dsResult.answers.length, 3);
assert.deepEqual(dsResult.sources, []);
assert.match(dsResult.mode, /DeepSeek.*未联网/);
await assert.rejects(assist(input, ds, undefined, async () => Response.json({}, { status: 401 })), e => e.status === 502);
await assert.rejects(assist(input, ds, undefined, async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: '   ' } }] })), e => e.status === 502);
console.log('PASS: DeepSeek config, no fallback, JSON request, no search parameters/sources, unsearched label, invalid key and blank response (mock).');
const zs = configuration({ AI_PROVIDER: 'zswing', ZSWING_API_KEY: 'fake-zs', ZSWING_MODEL: 'gpt-6-astra' });
assert.equal(zs.url, 'https://openai.zswing.net/v1/responses');
assert.equal(configuration({ AI_PROVIDER: 'zswing', DEEPSEEK_API_KEY: 'x', DEEPSEEK_MODEL: 'y' }), null);
const raw = { status: 'completed', output: [{ type: 'reasoning', summary: [] }, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: output.choices[0].message.content }] }] };
const zsResult = await assist(input, zs, undefined, async (url, options) => {
  assert.equal(url, zs.url);
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers.Authorization, 'Bearer fake-zs');
  const request = JSON.parse(options.body);
  assert.equal(request.messages, undefined);
  assert.equal(request.tools, undefined);
  assert.equal(request.store, false);
  assert.equal(request.stream, false);
  assert.equal(request.max_tokens, undefined);
  assert.equal(request.input[0].content[0].type, 'input_text');
  assert.ok(request.instructions.includes('JSON'));
  return Response.json(raw);
});
assert.equal(zsResult.answers.length, 3);
assert.deepEqual(zsResult.sources, []);
assert.match(zsResult.mode, /ZSwing-Plus Responses.*未联网/);
for (const bad of [{ ...raw, status: 'incomplete' }, { ...raw, output: [] }, output]) await assert.rejects(assist(input, zs, undefined, async () => Response.json(bad)));
await assert.rejects(assist(input, zs, undefined, async () => Response.json({}, { status: 403 })), e => e.status === 502);
await assert.rejects(assist(input, zs, undefined, async () => Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'No' }] }] })), e => e.status === 422);
console.log('PASS: Responses request contract, completed output parsing, no search/fallback, incomplete/empty/wrong-format/refusal/403 (mock).');

const asrEnv = { ASR_PROVIDER: 'bailian', ASR_API_KEY: 'fake-test-secret', ASR_WORKSPACE_ID: 'test-workspace', ASR_MODEL: 'paraformer-realtime-v2' };
assert.equal(asrConfiguration({}).configured, false);
assert.equal(asrConfiguration({ ...asrEnv, ASR_WORKSPACE_ID: 'evil/path' }).configured, false);
assert.equal(JSON.stringify(asrConfiguration(asrEnv)).includes(asrEnv.ASR_API_KEY), false);
const mockUpstream = new WebSocketServer({ port: 0, host: '127.0.0.1' });
await once(mockUpstream, 'listening');
const proxy = http.createServer();
let connectionCount = 0, audioBytes = 0, finishSeen = false;
const upstreamClients = new Set();
mockUpstream.on('connection', peer => {
  upstreamClients.add(peer); peer.on('close', () => upstreamClients.delete(peer));
  let id;
  peer.on('message', (raw, binary) => {
    if (binary) {
      audioBytes += raw.length;
      for (const [text, final] of [['新', false], ['新手怎么练？', true], ['新手怎么练？', true]]) peer.send(JSON.stringify({ header: { task_id: id, event: 'result-generated' }, payload: { output: { sentence: { begin_time: 0, text, sentence_end: final } } } }));
      return;
    }
    const message = JSON.parse(raw.toString());
    id = message.header.task_id;
    assert.equal(message.header.streaming, 'duplex');
    if (message.header.action === 'run-task') {
      assert.equal(message.payload.parameters.sample_rate, 16000);
      assert.equal(message.payload.parameters.format, 'pcm');
      assert.equal(message.payload.model, asrEnv.ASR_MODEL);
      peer.send(JSON.stringify({ header: { task_id: id, event: 'task-started' } }));
    } else {
      assert.equal(message.header.action, 'finish-task'); finishSeen = true;
      peer.send(JSON.stringify({ header: { task_id: id, event: 'result-generated' }, payload: { output: { sentence: { begin_time: 1200, text: '每周几次？', sentence_end: true } } } }));
      peer.send(JSON.stringify({ header: { task_id: id, event: 'task-finished' } }));
    }
  });
});
const closeAsr = attachAsr(proxy, req => req.headers.authorization === 'Basic test-only', { env: asrEnv, connect: (url, options) => {
  assert.equal(url, 'wss://test-workspace.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference');
  assert.equal(options.headers.Authorization, 'Bearer fake-test-secret');
  connectionCount++;
  return new WebSocket(`ws://127.0.0.1:${mockUpstream.address().port}`);
} });
proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
const address = `127.0.0.1:${proxy.address().port}`;
const connectClient = (headers = {}) => new WebSocket(`ws://${address}/api/asr/live`, { headers: { Origin: `http://${address}`, Authorization: 'Basic test-only', ...headers } });
async function rejectsUpgrade(headers, status) {
  const client = connectClient(headers);
  client.on('error', () => {});
  const [, response] = await once(client, 'unexpected-response');
  assert.equal(response.statusCode, status); response.resume(); client.terminate();
}
try {
  await rejectsUpgrade({ Authorization: 'wrong' }, 401);
  await rejectsUpgrade({ Origin: 'https://other.example' }, 403);
  assert.equal(connectionCount, 0);
  const client = connectClient(); const events = [];
  client.on('message', raw => events.push(JSON.parse(raw.toString())));
  await once(client, 'open');
  await rejectsUpgrade({}, 429);
  client.send(JSON.stringify({ type: 'start' }));
  while (!events.some(e => e.type === 'ready')) await once(client, 'message');
  client.send(Buffer.alloc(3200), { binary: true });
  while (events.filter(e => e.type === 'text').length < 3) await once(client, 'message');
  assert.equal(events.at(-1).text, '新手怎么练？');
  assert.equal(events[1].interim, true);
  client.send(JSON.stringify({ type: 'finish' }));
  await once(client, 'close');
  assert.equal(events.at(-1).type, 'done');
  assert.equal(events.at(-2).text, '新手怎么练？每周几次？');
  assert.equal(audioBytes, 3200); assert.equal(finishSeen, true);
  const invalid = connectClient(); await once(invalid, 'open');
  const invalidResult = once(invalid, 'message'); invalid.send(Buffer.alloc(4));
  assert.equal(JSON.parse((await invalidResult)[0].toString()).type, 'error');
  await once(invalid, 'close');
  const abort = connectClient(); await once(abort, 'open');
  const ready = once(abort, 'message'); abort.send(JSON.stringify({ type: 'start' })); await ready;
  abort.close(); await once(abort, 'close');
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(upstreamClients.size, 0);
  console.log('PASS: real WebSocket proxy with local mock upstream, auth/origin/concurrency, PCM, interim/final deduplication, tail result before done, invalid ordering, upstream cleanup. No paid API calls.');
} finally { closeAsr(); for (const peer of upstreamClients) peer.terminate(); await new Promise(resolve => proxy.close(resolve)); await new Promise(resolve => mockUpstream.close(resolve)); }
