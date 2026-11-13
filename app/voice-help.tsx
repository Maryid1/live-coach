import { boundedAudioStep, requestMicrophone } from './microphone-start';
import VoiceConfirm from './voice-confirm';
import { useEffect, useRef, useState } from 'react';

export default function VoiceHelp({ secure, status, listening, onTesting }: { secure: boolean; status: string; listening: boolean; onTesting: (active: boolean) => void }) {
  const [message, setMessage] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const permissionPending = useRef(false);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  const run = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const context = useRef<AudioContext | null>(null);
  const frame = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const url = useRef('');
  const [playback, setPlayback] = useState('');
  const [level, setLevel] = useState(0);
  const [meter, setMeter] = useState('');
  const peak = useRef(0);
  const metered = useRef(false);
  function clearPlayback() {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = '';
    if (alive.current) setPlayback('');
  }
  function stop(keep = false) {
    run.current++;
    permissionPending.current = false;
    if (timer.current) clearTimeout(timer.current);
    cancelAnimationFrame(frame.current);
    const recording = recorder.current;
    recorder.current = null;
    if (recording) {
      if (!keep) { recording.ondataavailable = null; recording.onstop = null; }
      if (recording.state !== 'inactive') recording.stop();
    }
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    void context.current?.close().catch(error => console.warn('关闭麦克风测试音频失败', error.name));
    context.current = null;
    if (!keep) clearPlayback();
    onTesting(false);
    if (alive.current) { setTesting(false); setLevel(0); }
  }
  function finish() {
    stop(true);
    setMessage(!metered.current ? '测试结束，无法测量音量；如果有录音，请回放判断。' : peak.current > 0.01 ? '收到音频信号，但不代表识别到了人声。请回放确认是否能听清；能听清却无法转文字，需继续排查识别服务。' : '测试期间音频信号很弱或无信号。请检查系统权限、麦克风遮挡、蓝牙耳机及直播应用占用，再回放确认。');
  }
  useEffect(() => {
    alive.current = true;
    const hide = () => { if (document.hidden && !permissionPending.current) { stop(); setMessage('页面进入后台，测试已停止，录音已清除。'); } };
    document.addEventListener('visibilitychange', hide);
    return () => { alive.current = false; stop(); document.removeEventListener('visibilitychange', hide); };
  }, []);
  async function test(approved = false) {
    if (!secure) { setMessage('当前 HTTP 地址不允许网页访问麦克风。需先由管理员部署可信 HTTPS；更换浏览器或反复授权不能解除这个限制。'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setMessage('此浏览器没有提供麦克风接口。请更新系统浏览器或在独立浏览器中打开，不使用聊天软件内置网页。'); return; }
    if (listening) return;
    if (!approved) { setConfirmOpen(true); return; }
    clearPlayback(); peak.current = 0; metered.current = false; setMeter('准备测量音量…');
    onTesting(true);
    setTesting(true); setMessage('请在浏览器弹窗中允许使用麦克风。');
    const current = ++run.current;
    try {
      permissionPending.current = true;
      const media = await requestMicrophone({ audio: true }, () => alive.current && current === run.current, setMessage);
      permissionPending.current = false;
      if (!alive.current || current !== run.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const Audio = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) throw new Error('当前浏览器不支持音频测量接口。');
      context.current = new Audio();
      setMessage('麦克风已授权，正在启动音量检测。');
      await boundedAudioStep(context.current.resume(), '浏览器未恢复音量检测，请留在当前页并重新点击检查。');
      if (!alive.current || current !== run.current) return;
      if (document.hidden || context.current?.state !== 'running') throw new Error('页面或音频仍被暂停，请回到前台重新点击检查。');
      try {
        const audio = context.current;
        if (!audio) throw new Error('No audio context');
        const analyser = audio.createAnalyser(); analyser.fftSize = 2048;
        audio.createMediaStreamSource(media).connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        const sample = () => {
          if (current !== run.current) return;
          if (audio.state === 'running') {
            analyser.getByteTimeDomainData(samples);
            const rms = Math.sqrt(samples.reduce((sum, n) => sum + ((n - 128) / 128) ** 2, 0) / samples.length);
            peak.current = Math.max(peak.current, rms); metered.current = true;
            setLevel(Math.min(100, Math.round(rms * 500)));
            setMeter(rms > 0.01 ? '收到音频信号' : '音量很低，请靠近麦克风说话');
          } else setMeter('音频测量被浏览器暂停，不能据此判断麦克风无声');
          frame.current = requestAnimationFrame(sample);
        };
        sample();
      } catch { setMeter('此浏览器无法测量音量，可尝试录音回放'); }
      let canRecord = false;
      try {
        if (typeof MediaRecorder !== 'undefined') {
          const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported?.(type));
          const capture = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
          const chunks: Blob[] = [];
          capture.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
          capture.onstop = () => {
            // The normal stop invalidates the capture run once; later cancellation must discard it.
            if (!alive.current || run.current !== current + 1) return;
            const blob = new Blob(chunks, { type: capture.mimeType || chunks[0]?.type });
            if (blob.size) { clearPlayback(); url.current = URL.createObjectURL(blob); setPlayback(url.current); }
            else setMessage(previous => previous + ' 未生成可回放录音。');
          };
          capture.onerror = () => { if (run.current === current) { stop(); setMessage('录音失败，麦克风已关闭；可使用手机输入法语音输入。'); } };
          recorder.current = capture; capture.start(); canRecord = true;
        }
      } catch { recorder.current = null; }
      setMessage(canRecord ? '请说一句话：今天练什么？最多录制 8 秒，停止后可回放。不会自动转文字。' : '此浏览器不支持本地录音回放，仅测试音量，8 秒后关闭。');
      timer.current = setTimeout(finish, 8000);
    } catch (e) {
      if (!alive.current || current !== run.current) return;
      const name = e instanceof Error ? e.name : '';
      setMessage(name === 'NotAllowedError' ? '权限未获允许：请检查浏览器网站权限和系统的麦克风权限，允许后重试。' : name === 'NotFoundError' ? '未找到可用麦克风，请检查设备或外接麦克风。' : name === 'NotReadableError' ? '麦克风可能被直播、通话或其他应用占用，请结束占用后重试。' : `麦克风测试失败：${e instanceof Error ? e.message : String(e)}`);
      stop();
    }
  }
  return <details className="voice-help" onToggle={e => { if (!e.currentTarget.open) stop(); }}><summary>语音不能用？检查设备与权限</summary>
    {confirmOpen && <VoiceConfirm title="测试麦克风" text="测量音量并录制最多 8 秒声音，仅在当前页面本地回放，不上传。关闭检查面板或离开页面会清除录音。" onCancel={() => setConfirmOpen(false)} onConfirm={() => { setConfirmOpen(false); void test(true); }}/>}
    <p><strong>连接环境：</strong>{secure ? '安全上下文' : 'HTTP 非安全连接，网页麦克风不可用'}</p>
    <p><strong>百炼实时转文字：</strong>{status}</p>
    <button className="button secondary" disabled={listening} onClick={testing ? finish : () => void test()}>{testing ? '停止麦克风测试' : '检查麦克风权限'}</button>
    {listening && <p>请先结束语音识别，再检查麦克风。</p>}
    {testing && <div><p>{meter}</p><meter aria-label="麦克风实时音量" min={0} max={100} value={level}/><p>此音量仅用于排查，不是分贝值，也不判断是否为人声。</p></div>}
    {playback && <div><p>本地录音（未上传）：</p><audio controls src={playback} onError={() => setMessage('浏览器无法回放此录音格式，请更新浏览器或改用手机输入法语音输入。')}/><button className="button secondary" onClick={clearPlayback}>清除录音</button></div>}
    {message && <p role="status">{message}</p>}
    <p><strong>OPPO／一加：</strong>检查系统设置中浏览器的麦克风权限，以及当前网站权限。菜单名称随系统版本不同。</p>
    <p><strong>iPhone／iPad Safari：</strong>检查当前网站的麦克风权限；使用键盘听写时，需在系统键盘设置中开启听写。</p>
    <p>HTTP 下可先点击问题输入框，使用手机键盘自带的语音输入；由输入法处理声音，确认文字后再生成。此功能不是网页录音。</p>
    <p>同一台设备正在直播时，麦克风可能被占用，切后台也可能暂停识别。建议直播与助播分设备使用。</p>
  </details>;
}
