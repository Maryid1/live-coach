import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyStudio, platforms, offlineAnswer, warmup, topics, scanRisk, safeUrl, medicalQuestion } from '../lib/coach.ts';

test('three built-in platforms have unique identities and secure source links', () => {
  assert.equal(platforms.length, 3);
  assert.equal(new Set(platforms.map(p => p.id)).size, 3);
  assert.ok(platforms.every(p => safeUrl(p.url) && p.status.includes('待核对')));
});
test('unknown questions clarify without inventing factual answers', () => {
  const result = offlineAnswer('器械 XY123 的电机参数是多少', emptyStudio);
  assert.equal(result.answers.length, 3);
  assert.match(result.answers[1].text, /核对/);
  assert.equal(result.sources.length, 0);
  assert.match(result.mode, /非 AI 联网/);
});
test('medical questions route to non-diagnostic boundaries', () => {
  for (const q of ['膝盖疼还能练吗', '术后怎么康复', '孕期锻炼']) {
    assert.equal(medicalQuestion(q), true);
    assert.match(offlineAnswer(q, emptyStudio).answers[0].text, /医疗专业人员评估/);
  }
});
test('frequency explanation has a transparently static reference', () => {
  const result = offlineAnswer('一周练几次', emptyStudio);
  assert.equal(result.sources.length, 1);
  assert.match(result.sources[0].title, /非本次联网/);
  assert.match(result.answers[1].text, /一般成年人/);
});
test('missing offer never invents a price', () => {
  const result = offlineAnswer('体验课多少钱', emptyStudio);
  assert.match(result.answers[0].text, /核对清楚/);
  assert.ok(result.answers.every(a => !/\d+元/.test(a.text)));
});
test('confirmed offer is used verbatim', () => {
  const studio = { ...emptyStudio, offer: '单次咨询 30 分钟，实际费用到店确认。' };
  assert.ok(offlineAnswer('课程怎么安排', studio).answers[0].text.includes(studio.offer));
  assert.ok(warmup('体验课介绍', studio, false, 0).includes(studio.offer));
});
test('every topic has readable content and a distinct long version', () => {
  for (const topic of topics) {
    const short = warmup(topic, emptyStudio, false, 0);
    assert.ok(short.length > 30);
    assert.ok(warmup(topic, emptyStudio, true, 0).length > short.length);
    assert.notEqual(warmup(topic, emptyStudio, false, 1), short);
    assert.ok(!short.includes('undefined'));
  }
});
test('risk checker identifies categories and deduplicates repeated phrases', () => {
  const hits = scanRisk('保证瘦保证瘦，根治，全网最低，加我微信，胖子。');
  assert.equal(hits.filter(r => r.phrase === '保证瘦').length, 1);
  assert.ok(hits.length >= 5);
  assert.ok(hits.every(r => r.reason && r.suggestion));
});
test('custom terms are literal, deduplicated, and not labeled official', () => {
  const hits = scanRisk('优惠 a+b', ['a+b', 'a+b', '', '未出现']);
  assert.equal(hits.length, 1);
  assert.match(hits[0].reason, /非官方/);
  assert.equal(scanRisk('我们先聊聊训练目标。').length, 0);
});
test('links reject scripts, insecure protocols and embedded credentials', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'http://example.org', 'https://user:pass@example.org', 'not-a-url']) assert.equal(safeUrl(url), false);
  assert.equal(safeUrl('https://example.org/rules?q=1'), true);
});
