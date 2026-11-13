class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(1600);
    this.length = 0;
    this.weight = 0;
    this.sum = 0;
    this.ratio = sampleRate / 16000;
    this.stopped = false;
    this.port.onmessage = event => {
      if (event.data === 'stop') {
        this.stopped = true;
        this.flush();
        this.port.postMessage({ type: 'stopped' });
      }
    };
  }
  flush() {
    if (!this.length) return;
    const bytes = new ArrayBuffer(this.length * 2);
    const view = new DataView(bytes);
    for (let i = 0; i < this.length; i++) view.setInt16(i * 2, this.buffer[i], true);
    this.port.postMessage({ type: 'pcm', bytes }, [bytes]);
    this.length = 0;
  }
  process(inputs) {
    if (this.stopped) return false;
    const input = inputs[0];
    if (!input?.length) return true;
    // 按实际采样率累计加权平均，跨音频块保留相位，输出 16kHz 单声道 PCM。
    for (let i = 0; i < input[0].length; i++) {
      let sample = 0;
      for (const channel of input) sample += channel[i] / input.length;
      let remaining = 1;
      while (remaining > 1e-8) {
        const take = Math.min(remaining, this.ratio - this.weight);
        this.sum += sample * take;
        this.weight += take;
        remaining -= take;
        if (this.weight >= this.ratio - 1e-8) {
          const value = Math.max(-1, Math.min(1, this.sum / this.ratio));
          this.buffer[this.length++] = Math.round(value * (value < 0 ? 32768 : 32767));
          this.sum = 0; this.weight = 0;
          if (this.length === this.buffer.length) this.flush();
        }
      }
    }
    return true;
  }
}
registerProcessor('coach-pcm', PcmCapture);
