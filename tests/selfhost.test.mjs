import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { once } from 'node:events';
const password = randomBytes(24).toString('hex');
const child = spawn(process.execPath, ['outputs/selfhost/server.mjs'], { env: { ...process.env, APP_USER: 'test', APP_PASSWORD: password, HOST: '127.0.0.1', PORT: '5198' }, stdio: ['ignore', 'pipe', 'inherit'] });
const timeout = setTimeout(() => child.kill(), 15000);
try {
  await once(child.stdout, 'data');
  const base = 'http://127.0.0.1:5198';
  const headers = { Authorization: 'Basic ' + Buffer.from(`test:${password}`).toString('base64') };
  assert.equal((await fetch(base)).status, 401);
  assert.equal((await fetch(base, { headers: { Authorization: 'Basic invalid' } })).status, 401);
  const home = await fetch(base, { headers });
  assert.equal(home.status, 200);
  assert.match(await home.text(), /自部署测试版/);
  assert.equal(home.headers.get('x-frame-options'), 'DENY');
  assert.deepEqual(await (await fetch(base + '/api/assist', { headers })).json(), { configured: false });
  assert.equal((await fetch(base + '/api/assist', { headers, method: 'POST' })).status, 503);
  assert.equal((await fetch(base + '/.env', { headers })).status, 404);
  assert.equal((await fetch(base + '/%2e%2e%2fserver.mjs', { headers })).status, 403);
  console.log('PASS: unauthenticated blocked, bad credentials blocked, HTML, security headers, disabled AI, secret path blocked, traversal blocked.');
} finally { clearTimeout(timeout); child.kill(); }
