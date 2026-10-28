// Only an explicit stop releases the stream; tabs never own the camera.
const video = document.getElementById('camera');
const canvas = document.getElementById('preview');
const ctx = canvas.getContext('2d');
let pose, stream, timer, starting, inFlight, inferenceToken, generation = 0, running = false, latestFrame = null;
let lastPublish = 0;
function publish(status, message, score = null) {
  const now = Date.now();
  if (now - lastPublish < 500 && score !== null) return;
  lastPublish = now;
  chrome.runtime.sendMessage({type: 'posture-update', status, message, score, running}).catch(console.error);
}
function readBaseline() {
  try {
    const profiles = JSON.parse(localStorage.getItem('pg_posture_profiles') || '[]');
    const activeId = localStorage.getItem('pg_active_profile_id');
    const profile = profiles.find(item => item.id === activeId) || profiles[0];
    return profile?.isCalibrated ? profile.data : null;
  } catch { return null; }
}
function onResults(results) {
  if (!running || inferenceToken !== generation) return;
  latestFrame = {landmarks: results.poseLandmarks || null};
  const state = scorePosture(results.poseLandmarks, readBaseline());
  publish(state.status, state.message, state.score);
}
async function start() {
  if (starting) return starting;
  if (running) return {running};
  starting = (async () => {
    const token = ++generation;
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({video: {width: 640, height: 480}, audio: false});
      if (token !== generation) { acquired.getTracks().forEach(track => track.stop()); return {running: false}; }
      stream = acquired;
      video.srcObject = stream;
      await video.play();
      await inFlight?.catch(() => {});
      if (token !== generation) { acquired.getTracks().forEach(track => track.stop()); return {running: false}; }
      if (!pose) {
        pose = new Pose({locateFile: file => `vendor/pose/${file}`});
        pose.setOptions({modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5});
        pose.onResults(onResults);
      }
      stream.getVideoTracks()[0].addEventListener('ended', () => { if (token === generation) stop('카메라 연결이 끊어졌습니다. 분석 화면에서 다시 시작해주세요.'); });
      running = true;
      publish('neutral', '카메라 연결 완료 · 자세 인식 중');
      const tick = async () => {
        if (!running || token !== generation) return;
        try { inferenceToken = token; inFlight = pose.send({image: video}); await inFlight; }
        catch (error) {
          console.error(error);
          if (running && token === generation) { latestFrame = null; publish('neutral', '분석 오류 · 카메라를 재시작해주세요'); }
        }
        finally { if (running && token === generation) timer = setTimeout(tick, 100); }
      };
      timer = setTimeout(tick, 0);
      return {running};
    } catch (error) {
      stop('카메라를 시작할 수 없습니다. 권한과 연결을 확인해주세요.');
      throw error;
    }
  })();
  try { return await starting; } finally { starting = null; }
}
function stop(message = '카메라 정지') {
  generation++;
  running = false;
  clearTimeout(timer);
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  video.srcObject = null;
  latestFrame = null;
  publish('paused', message);
  return {running};
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.target !== 'engine' || sender.id !== chrome.runtime.id || sender.tab || (sender.url && sender.url !== chrome.runtime.getURL('background.js'))) return;
  if (message.command === 'start') {
    start().then(reply, error => reply({error: error.message}));
    return true;
  }
  if (message.command === 'stop') reply(stop());
  if (message.command === 'status') reply({running});
  if (message.command === 'snapshot') {
    let frame = null;
    if (running && latestFrame) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frame = {...latestFrame, image: canvas.toDataURL('image/jpeg', 0.65)};
    }
    reply({running, frame});
  }
});
