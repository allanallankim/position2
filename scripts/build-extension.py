"""Build a self-contained MV3 extension from the original web app."""
from pathlib import Path
import re
import shutil
import subprocess

root = Path(__file__).resolve().parent.parent
out = root / 'extension'
out.mkdir(exist_ok=True)
html = (root / 'index.html').read_text(encoding='utf-8')
scripts = re.findall(r'<script>(.*?)</script>', html, re.S)
config, app = scripts
html = re.sub(r'<script.*?</script>', '', html, flags=re.S)
html = re.sub(r'<link[^>]+(?:fonts.googleapis|fonts.gstatic)[^>]*>', '', html)
style = re.search(r'<style>(.*?)</style>', html, re.S).group(1)
html = re.sub(r'<style>.*?</style>', '<link rel="stylesheet" href="app.css">', html, flags=re.S)
html = html.replace('</body>', '<script src="camera.js"></script><script src="app.js"></script><script src="widget.js"></script></body>')
html = html.replace('쿠키', '로컬 저장소')
app = re.sub(r'function setCookie\(.*?// --- Default Profile', '''function setCookie(name, value) { localStorage.setItem(name, value); }
      function getCookie(name) { return localStorage.getItem(name); }

      // --- Default Profile''', app, flags=re.S)
app = app.replace('https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}', 'vendor/pose/${file}')
app = app.replace("isWebcamRunning = false;\n        btnCamText", "isWebcamRunning = false;\n        if (camera) camera.stop().catch(error => alert(error.message));\n        btnCamText")
app = app.replace('function onPoseResults(results) {', 'function onPoseResults(results) {\n        if (!isWebcamRunning) return;')
app = app.replace('let badPostureFrameCount = 0;', 'let badPostureFrameCount = 0; let badPostureSince = 0;')
app = app.replace('badPostureFrameCount++;', 'badPostureFrameCount++; if (!badPostureSince) badPostureSince = performance.now();')
app = app.replace('badPostureFrameCount >= 35', 'now - badPostureSince >= 1200')
app = app.replace('badPostureFrameCount = Math.max(0, badPostureFrameCount - 2);', 'badPostureFrameCount = 0; badPostureSince = 0;')
app = app.replace("console.error('Pose estimation error:', err);", "console.error('Pose estimation error:', err); updateStatusUI('neutral', '분석 오류 · 카메라를 재시작해주세요');")
# The engine owns publishing. UI loading/unloading must never overwrite its state.
app = app.replace('// --- Initialization On Load ---', '''
      engineCommand('status').then(state => { if (state.running) startCamera(); }).catch(console.error);
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.postureState) return;
        const state = changes.postureState.newValue;
        if (!state.running && isWebcamRunning) {
          isWebcamRunning = false;
          if (camera) { camera.generation++; clearTimeout(camera.timer); }
          btnCamText.textContent = '카메라 재개';
          updateStatusUI('paused', state.message);
        }
      });
      // --- Initialization On Load ---''')
math = re.search(r'      function analyzePosture\(landmarks\) \{.*?(?=      // --- MediaPipe onResults)', app, re.S).group(0)
(out / 'posture-math.js').write_text(math, encoding='utf-8')
(out / 'monitor.html').write_text(html, encoding='utf-8')
(out / 'app.js').write_text(app, encoding='utf-8')
(out / 'input.css').write_text('@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' + style, encoding='utf-8')
# Keep the original Tailwind theme and scan dynamic class strings in app.js.
config = config.replace('tailwind.config =', 'module.exports =').strip()
config = config.replace("darkMode: 'class',", "content: ['./extension/monitor.html', './extension/app.js'], darkMode: 'class',")
(root / 'tailwind.config.cjs').write_text(config, encoding='utf-8')
subprocess.run(['node', 'node_modules/tailwindcss/lib/cli.js', '-c', 'tailwind.config.cjs', '-i', 'extension/input.css', '-o', 'extension/app.css', '--minify'], cwd=root, check=True)
vendor = out / 'vendor' / 'pose'
vendor.mkdir(parents=True, exist_ok=True)
for source in (root / 'node_modules/@mediapipe/pose').iterdir():
    if source.suffix in {'.js', '.wasm', '.data', '.binarypb', '.tflite'}:
        shutil.copy2(source, vendor / source.name)
print('Built extension/ (load this directory in chrome://extensions).')
