// Visible UI adapter; the offscreen document owns the only camera and Pose instance.
async function engineCommand(command) {
  const response = await chrome.runtime.sendMessage({type: 'engine-command', command});
  if (!response || response.error) throw new Error(response?.error || '백그라운드 분석에 연결할 수 없습니다.');
  return response;
}
class Pose {
  setOptions() {}
  onResults(callback) { this.callback = callback; }
  async send() {
    const snapshot = await engineCommand('snapshot');
    if (!snapshot.running) throw new Error('카메라가 정지되었습니다.');
    if (!snapshot.frame) return;
    let image;
    if (snapshot.frame.image) {
      image = new Image();
      image.src = snapshot.frame.image;
      await image.decode();
    }
    this.callback?.({poseLandmarks: snapshot.frame.landmarks, image});
  }
}
class Camera {
  constructor(video, options) { this.video = video; this.options = options; this.generation = 0; }
  async start() {
    if (this.starting) return this.starting;
    this.starting = this.connect();
    try { await this.starting; } finally { this.starting = null; }
  }
  async connect() {
    clearTimeout(this.timer);
    const generation = ++this.generation;
    const state = await engineCommand('status');
    if (!state.running) {
      // Request permission here because an offscreen page cannot show permission prompts.
      const permissionStream = await navigator.mediaDevices.getUserMedia({video: true, audio: false});
      permissionStream.getTracks().forEach(track => track.stop());
      if (generation !== this.generation) return;
      await engineCommand('start');
    }
    if (generation !== this.generation) return;
    const canvas = document.getElementById('output-canvas');
    canvas.width = 640;
    canvas.height = 480;
    const tick = async () => {
      if (generation !== this.generation) return;
      try { await this.options.onFrame(); }
      finally { if (generation === this.generation) this.timer = setTimeout(tick, 100); }
    };
    this.timer = setTimeout(tick, 100);
  }
  async stop() {
    this.generation++;
    clearTimeout(this.timer);
    await engineCommand('stop');
  }
}
