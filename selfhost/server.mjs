import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { configuration, validateInput, assist } from './assist.mjs';
import { createScriptsStore } from './scripts-store.mjs';
const scriptsStore = createScriptsStore(process.env.DATA_DIR);
let activeRequests = 0;
const user = process.env.APP_USER, password = process.env.APP_PASSWORD;
if (!user || user.includes(':') || !password || password.length < 16) {
  console.error('Set APP_USER (no colon) and APP_PASSWORD (at least 16 characters).'); process.exit(1);
}
const hash = value => createHash('sha256').update(value).digest();
const expected = hash(`${user}:${password}`);
const root = await realpath(fileURLToPath(new URL('./public', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Basic ') || !timingSafeEqual(hash(Buffer.from(auth.slice(6), 'base64').toString('utf8')), expected)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Live Coach", charset="UTF-8"'); res.writeHead(401); res.end('Authentication required'); return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/api/scripts') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      try {
        if (req.method === 'GET') { res.end(JSON.stringify({ scripts: await scriptsStore.read() })); return; }
        if (!['POST', 'PUT', 'DELETE'].includes(req.method)) { res.writeHead(405); res.end('{}'); return; }
        if (![ `http://${req.headers.host}`, `https://${req.headers.host}` ].includes(req.headers.origin)) { res.writeHead(403); res.end(JSON.stringify({ error: '请求来源不允许。' })); return; }
        if (!req.headers['content-type']?.includes('application/json')) { res.writeHead(415); res.end('{}'); return; }
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 220000) { res.writeHead(413); res.end(JSON.stringify({ error: '稿件过大。' })); return; } chunks.push(chunk); }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!body || typeof body !== 'object') throw new Error(); } catch { res.writeHead(400); res.end(JSON.stringify({ error: '请求格式错误。' })); return; }
        res.end(JSON.stringify({ scripts: await scriptsStore.mutate(req.method, body) }));
      } catch (e) { res.writeHead(e.status || 503); res.end(JSON.stringify({ error: e.status ? e.message : '稿件存储无法读写，请检查数据目录权限；未覆盖当前编辑内容。' })); }
      return;
    }
    if (pathname === '/api/assist') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const config = configuration();
      if (req.method === 'GET') { res.end(JSON.stringify(config ? { configured: true, provider: config.provider || 'bailian', search: !config.provider || config.provider === 'bailian' } : { configured: false })); return; }
      const reply = (status, error) => { res.writeHead(status); res.end(JSON.stringify({ error })); };
      if (req.method !== 'POST') { reply(405, '请求方法不支持。'); return; }
      if (!config) { reply(503, '当前服务商配置不完整，请检查服务器配置或使用内置话术。'); return; }
      if (req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) { reply(403, '请求来源不允许。'); return; }
      if (!req.headers['content-type']?.includes('application/json')) { reply(415, '需要 JSON 请求。'); return; }
      if (activeRequests >= 1) { reply(429, '已有一个生成任务，请等完成后再试。'); return; }
      activeRequests++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 55000);
      const cancel = () => { if (!res.writableEnded) controller.abort(); };
      res.on('close', cancel);
      try {
        let size = 0; const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 24000) { reply(413, '输入过长。'); return; }
          chunks.push(chunk);
        }
        let input;
        try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { reply(400, 'JSON 格式错误。'); return; }
        const result = await assist(validateInput(input), config, controller.signal);
        res.end(JSON.stringify(result));
      } catch (error) {
        if (!res.destroyed) reply(error.status || 502, error.status ? error.message : '本次联网超时或返回异常，当前稿件已保留。');
      } finally { clearTimeout(timer); res.off('close', cancel); activeRequests--; }
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const resolved = await realpath(path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`));
    if (!resolved.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const info = await stat(resolved);
    if (!info.isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', types[path.extname(resolved)] || 'application/octet-stream');
    res.setHeader('Content-Length', info.size);
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(resolved).on('error', () => res.destroy()).pipe(res);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => console.log('Live Coach listening'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
