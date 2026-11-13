export async function boundedAudioStep<T>(task: Promise<T>, message: string, milliseconds = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([task, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]);
  } finally { clearTimeout(timer!); }
}

export async function requestMicrophone(constraints: MediaStreamConstraints, active: () => boolean, status: (message: string) => void) {
  let expired = false;
  // 系统权限窗口可能暂时隐藏网页；未回到前台时不继续录音，也不连接识别服务。
  const pending = navigator.mediaDevices.getUserMedia(constraints).then(media => {
    if (expired || !active()) { media.getTracks().forEach(track => track.stop()); throw new Error('麦克风请求已取消。'); }
    return media;
  });
  let media: MediaStream;
  try { media = await boundedAudioStep(pending, '等待麦克风授权超时，请确认权限后重新点击开始。', 45000); }
  catch (error) { expired = true; throw error; }
  try {
    if (document.hidden) {
      status('麦克风已授权，等待返回当前网页；尚未开始识别。');
      let interval: ReturnType<typeof setInterval>;
      try {
        await boundedAudioStep(new Promise<void>((resolve, reject) => {
          interval = setInterval(() => {
            if (!active()) reject(new Error('麦克风请求已取消。'));
            else if (!document.hidden) resolve();
          }, 100);
        }), '授权后页面仍在后台，已释放麦克风；请回到网页重新开始。', 5000);
      } finally { clearInterval(interval!); }
    }
    if (!active()) throw new Error('麦克风请求已取消。');
    return media;
  } catch (error) { media.getTracks().forEach(track => track.stop()); throw error; }
}
