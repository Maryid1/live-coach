import { boundedAudioStep, requestMicrophone } from './microphone-start';
const captureUrl = new URL('./pcm-capture.js', import.meta.url).href;

type Callbacks = {
  status: (message: string) => void;
  text: (text: string, interim: boolean) => void;
  end: (error?: string) => void;
};

export class RealtimeSpeech {
  private permissionPending = false;
  get waitingForPermission() { return this.permissionPending; }
  private socket: WebSocket | null = null;
  private audio: AudioContext | null = null;
  private media: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private phase: 'starting' | 'streaming' | 'finishing' | 'closed' = 'starting';
  constructor(private callbacks: Callbacks) {}

  private later(fn: () => void, ms: number) { this.timers.push(setTimeout(fn, ms)); }
  private releaseAudio() {
    this.media?.getTracks().forEach(track => track.stop()); this.media = null;
    this.source?.disconnect(); this.source = null;
    if (this.worklet) { this.worklet.port.onmessage = null; this.worklet.disconnect(); this.worklet = null; }
    const audio = this.audio; this.audio = null;
    if (audio && audio.state !== 'closed') void audio.close().catch(error => console.warn('关闭音频上下文失败', error.name));
  }
  abort() {
    this.phase = 'closed';
    this.timers.forEach(clearTimeout); this.timers = [];
    this.releaseAudio();
    if (this.socket) {
      this.socket.onopen = null; this.socket.onmessage = null; this.socket.onclose = null; this.socket.onerror = null;
      this.socket.close(); this.socket = null;
    }
  }
  private complete(error?: string) {
    if (this.phase === 'closed') return;
    this.abort(); this.callbacks.end(error);
  }
  async start() {
    try {
      this.callbacks.status('请允许麦克风权限；正在准备百炼实时语音连接。');
      this.permissionPending = true;
      const media = await requestMicrophone({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }, () => !this.isClosed(), this.callbacks.status);
      this.permissionPending = false;
      if (this.isClosed()) { media.getTracks().forEach(track => track.stop()); return; }
      this.media = media;
      this.callbacks.status('麦克风已授权，正在启动音频采集。');
      // 使用设备实际采样率，由现有工作线程转换到 16kHz，避免强制采样率限制。
      const audio = new AudioContext();
      this.audio = audio;
      await boundedAudioStep(audio.resume(), '浏览器未恢复音频采集，请留在当前页并重新点击开始。');
      if (this.isClosed()) return;
      if (audio.state !== 'running') throw new Error('音频采集被浏览器暂停，请重新点击开始。');
      this.callbacks.status('正在加载实时音频处理模块。');
      await boundedAudioStep(audio.audioWorklet.addModule(captureUrl), '音频处理模块加载超时，请检查网络并刷新网页。');
      if (this.isClosed()) return;
      if (document.hidden) throw new Error('页面进入后台，已停止语音启动。');
      this.callbacks.status('音频采集已准备，正在连接百炼。');
      this.source = audio.createMediaStreamSource(media);
      this.worklet = new AudioWorkletNode(audio, 'coach-pcm');
      const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/asr/live`);
      this.socket = socket;
      this.later(() => { if (this.phase === 'starting') this.complete('连接百炼超时，请检查服务器网络与 Nginx WebSocket 转发配置。'); }, 16000);
      socket.onopen = () => socket.send(JSON.stringify({ type: 'start' }));
      socket.onerror = () => this.complete('实时语音连接失败，请检查登录状态、语音配置、是否有其他识别任务及 Nginx 转发。');
      socket.onclose = () => this.complete('实时语音连接中断，已收到的文字保留，请检查网络并重试。');
      socket.onmessage = event => {
        if (this.phase === 'closed') return;
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case 'ready':
              if (this.phase !== 'starting') throw new Error('语音服务返回了重复启动消息。');
              this.phase = 'streaming';
              this.worklet!.port.onmessage = e => {
                if (e.data.type === 'pcm' && this.phase !== 'closed') {
                  if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 128000) return this.complete('语音上传网络拥堵，识别已停止，已有文字保留。');
                  socket.send(e.data.bytes);
                } else if (e.data.type === 'stopped' && this.phase === 'finishing') {
                  this.releaseAudio();
                  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'finish' }));
                  else this.complete('结束识别时网络已断开，请核对句尾。');
                }
              };
              this.source!.connect(this.worklet!); this.worklet!.connect(audio.destination);
              audio.onstatechange = () => { if (this.phase === 'streaming' && audio.state !== 'running') this.complete('音频采集被浏览器暂停，识别已停止。'); };
              this.callbacks.status('百炼实时识别中，请说话；文字会持续更新，最多 60 秒。');
              this.later(() => this.stop(), 60000);
              break;
            case 'text':
              if (typeof data.text !== 'string' || typeof data.interim !== 'boolean') throw new Error('实时文字结果格式不正确。');
              this.callbacks.text(data.text, data.interim); break;
            case 'limit': this.stop(); break;
            case 'done': this.complete(); break;
            case 'error': this.complete(typeof data.message === 'string' ? data.message : '语音服务返回错误。'); break;
            default: throw new Error('语音服务返回了未知消息。');
          }
        } catch (error) { this.complete(error instanceof Error ? error.message : '无法解析语音结果。'); }
      };
    } catch (error) {
      this.permissionPending = false;
      const name = error instanceof Error ? error.name : '';
      this.complete(name === 'NotAllowedError' ? '麦克风权限未允许，请检查网站和系统权限。' : name === 'NotFoundError' ? '没有找到麦克风设备。' : name === 'NotReadableError' ? '麦克风无法读取，可能被直播或通话占用。' : `语音启动失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  private isClosed() { return this.phase === 'closed'; }
  stop() {
    if (this.phase === 'closed' || this.phase === 'finishing') return;
    if (this.phase === 'starting') { this.complete('已取消本次语音连接。'); return; }
    this.phase = 'finishing';
    this.callbacks.status('已请求结束，正在接收最后识别结果，请稍候。');
    // 先排空工作线程的末尾音频，再发送结束指令，避免截掉句尾。
    this.worklet!.port.postMessage('stop');
    this.later(() => this.complete('等待最终文字超时，已有文字保留，请核对句尾。'), 12000);
  }
}
