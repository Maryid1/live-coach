import { randomUUID } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';

export function asrConfiguration(env = process.env) {
  if (env.ASR_PROVIDER !== 'bailian') return { configured: false, error: '服务器尚未启用百炼语音识别。' };
  if (!env.ASR_API_KEY?.trim() || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$/.test(env.ASR_WORKSPACE_ID || '') || env.ASR_MODEL !== 'paraformer-realtime-v2') {
    return { configured: false, error: '语音配置不完整：请检查 ASR_API_KEY、北京地域 ASR_WORKSPACE_ID 和 ASR_MODEL。' };
  }
  return { configured: true, provider: 'bailian', model: env.ASR_MODEL };
}

export function attachAsr(server, authenticate, { env = process.env, connect = (url, options) => new WebSocket(url, options) } = {}) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 32768, perMessageDeflate: false });
  let active = false;
  const sessions = new Set();
  server.on('upgrade', (req, socket, head) => {
    const reject = code => { socket.end(`HTTP/1.1 ${code} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); };
    if (req.url !== '/api/asr/live') return reject(404);
    if (!authenticate(req)) return reject(401);
    if (![`https://${req.headers.host}`, `http://${req.headers.host}`].includes(req.headers.origin)) return reject(403);
    if (!asrConfiguration(env).configured) return reject(503);
    if (active) return reject(429);
    // 在升级握手前占用名额，避免同时到达的请求建立多个收费任务。
    active = true;
    const releaseHandshake = () => { active = false; };
    socket.once('close', releaseHandshake);
    sockets.handleUpgrade(req, socket, head, client => {
      socket.off('close', releaseHandshake);
      let upstream;
      let state = 'waiting';
      let bytes = 0;
      let ended = false;
      const taskId = randomUUID();
      const sentences = new Map();
      const timers = new Set();
      const later = (fn, ms) => { const timer = setTimeout(fn, ms); timers.add(timer); return timer; };
      const send = value => {
        if (client.readyState !== WebSocket.OPEN) return;
        if (client.bufferedAmount > 65536) { cleanup(); client.terminate(); return; }
        client.send(JSON.stringify(value));
      };
      const cleanup = () => {
        if (ended) return;
        ended = true; state = 'closed'; active = false;
        for (const timer of timers) clearTimeout(timer);
        if (upstream && upstream.readyState !== WebSocket.CLOSED) upstream.terminate();
        sessions.delete(cancel);
      };
      const close = () => {
        cleanup(); client.close();
        const force = setTimeout(() => client.terminate(), 1000); force.unref();
      };
      const fail = message => { if (!ended) { send({ type: 'error', message }); close(); } };
      const cancel = () => { cleanup(); client.terminate(); };
      sessions.add(cancel);
      client.on('close', cleanup);
      client.on('error', cleanup);
      const initial = later(() => fail('语音连接启动超时，请重试并检查网络及代理配置。'), 15000);
      const finish = () => {
        if (state !== 'streaming') return fail('语音任务尚未就绪，无法正常结束。');
        state = 'finishing';
        upstream.send(JSON.stringify({ header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' }, payload: { input: {} } }));
        later(() => fail('等待最后识别结果超时，已收到的文字保留，请核对句尾。'), 10000);
      };
      client.on('message', (data, binary) => {
        if (ended) return;
        if (binary) {
          if (state !== 'streaming') return fail('音频发送时序错误，请重新开始识别。');
          bytes += data.length;
          if (data.length % 2 || bytes > 16000 * 2 * 61) return fail('音频超过单次时长限制或格式不正确。');
          if (upstream.bufferedAmount > 128000) return fail('语音上传网络拥堵，本次识别已停止。');
          upstream.send(data, { binary: true });
          return;
        }
        let command;
        try { command = JSON.parse(data.toString()); } catch { return fail('语音控制消息格式错误。'); }
        if (command.type === 'finish') { finish(); return; }
        if (command.type !== 'start' || state !== 'waiting') return fail('语音控制消息顺序错误。');
        state = 'connecting';
        const url = `wss://${env.ASR_WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference`;
        try {
          upstream = connect(url, { headers: { Authorization: `Bearer ${env.ASR_API_KEY.trim()}` }, handshakeTimeout: 10000, maxPayload: 262144, perMessageDeflate: false });
        } catch { fail('无法建立百炼语音连接，请检查服务器配置。'); return; }
        upstream.on('error', () => fail('服务器连接百炼语音服务失败，请检查网络、北京地域工作空间和权限。'));
        upstream.on('unexpected-response', (_request, response) => {
          const code = response.statusCode;
          response.resume();
          fail(code === 401 || code === 403 ? `百炼鉴权失败（${code}），请检查语音密钥、工作空间和模型权限。` : code === 429 ? '百炼调用受限（429），请检查额度和并发限制。' : `百炼连接被拒绝（HTTP ${code}）。`);
        });
        upstream.on('close', () => { if (!ended) fail('百炼语音连接意外断开，已收到的文字保留。'); });
        upstream.on('open', () => {
          if (ended) return;
          upstream.send(JSON.stringify({ header: { action: 'run-task', task_id: taskId, streaming: 'duplex' }, payload: { task_group: 'audio', task: 'asr', function: 'recognition', model: env.ASR_MODEL, parameters: { format: 'pcm', sample_rate: 16000, disfluency_removal_enabled: false }, input: {} } }));
        });
        upstream.on('message', raw => {
          if (ended) return;
          let event;
          try { event = JSON.parse(raw.toString()); } catch { return fail('百炼返回了无法解析的语音结果。'); }
          if (event.header?.task_id !== taskId) return fail('百炼返回的语音任务标识不匹配。');
          switch (event.header.event) {
            case 'task-started':
              if (state !== 'connecting') return fail('百炼返回的任务状态不正确。');
              clearTimeout(initial); state = 'streaming'; send({ type: 'ready' });
              later(() => { if (state === 'streaming') { send({ type: 'limit' }); later(() => { if (state === 'streaming') fail('已超过单次识别时长。'); }, 2000); } }, 60000);
              break;
            case 'result-generated': {
              const sentence = event.payload?.output?.sentence;
              if (sentence?.heartbeat) break;
              if (!sentence || !Number.isFinite(sentence.begin_time) || typeof sentence.text !== 'string' || typeof sentence.sentence_end !== 'boolean') return fail('百炼识别结果缺少句子字段。');
              if (state !== 'streaming' && state !== 'finishing') return fail('百炼返回结果的时序不正确。');
              // 用句子开始时间替换同一句的临时结果，避免重复追加定稿事件。
              sentences.set(sentence.begin_time, { text: sentence.text, final: sentence.sentence_end });
              const ordered = [...sentences.entries()].sort((a, b) => a[0] - b[0]).map(([, value]) => value);
              const text = ordered.map(s => s.text).join('');
              if (text.length > 12000 || sentences.size > 1000) return fail('语音识别结果超出长度限制。');
              send({ type: 'text', text: text.slice(0, 1500), interim: ordered.some(s => !s.final) });
              break;
            }
            case 'task-finished':
              if (state !== 'finishing') return fail('百炼提前结束了语音任务，请核对已有文字。');
              send({ type: 'done' }); close(); break;
            case 'task-failed': {
              // 不透传上游原始消息，以免包含凭据或请求内容；保留可定位的错误码。
              const code = String(event.header.error_code || 'UNKNOWN').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80);
              fail(`百炼语音任务失败（${code}），请检查模型权限、额度和音频要求；已有文字保留。`); break;
            }
            default: fail('百炼返回了未知语音事件。');
          }
        });
      });
    });
  });
  return () => { for (const cancel of sessions) cancel(); sockets.close(); };
}
