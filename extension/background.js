const idle = {score: null, status: 'paused', message: '카메라 정지', updatedAt: 0};
let creating;
let commands = Promise.resolve();
const monitorURL = () => chrome.runtime.getURL('monitor.html');
const engineURL = () => chrome.runtime.getURL('offscreen.html');
async function ensureEngine() {
  if (creating) return creating;
  creating = (async () => {
    const contexts = await chrome.runtime.getContexts({contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [engineURL()]});
    if (!contexts.length) await chrome.offscreen.createDocument({url: 'offscreen.html', reasons: ['USER_MEDIA'], justification: 'Keep webcam posture inference independent of website navigation and monitor tabs.'});
  })();
  try { await creating; } finally { creating = null; }
}
async function openMonitor() {
  const url = chrome.runtime.getURL('monitor.html');
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(tab => tab.url === url);
  if (existing) {
    await chrome.tabs.update(existing.id, {active: true});
    await chrome.windows.update(existing.windowId, {focused: true});
  } else await chrome.tabs.create({url});
}
chrome.action.onClicked.addListener(() => openMonitor().catch(console.error));
chrome.runtime.onMessage.addListener((data, sender, reply) => {
  if (data.target === 'engine') return;
  if (data.type === 'open-monitor') { openMonitor().then(() => reply({ok: true}), error => reply({error: error.message})); return true; }
  if (data.type === 'engine-command' && sender.url === monitorURL()) {
    if (!['start', 'stop', 'snapshot', 'status'].includes(data.command)) return;
    const operation = async () => {
      await ensureEngine();
      return chrome.runtime.sendMessage({target: 'engine', command: data.command});
    };
    if (['start', 'stop'].includes(data.command)) {
      commands = commands.catch(() => {}).then(operation);
      commands.then(reply, error => reply({error: error.message}));
    } else operation().then(reply, error => reply({error: error.message}));
    return true;
  }
  if (data.type !== 'posture-update' || sender.url !== engineURL()) return;
  if (data.score !== null && (!Number.isFinite(data.score) || data.score < 0 || data.score > 100)) return;
  const state = {score: data.score, status: String(data.status), message: String(data.message).slice(0, 200), running: !!data.running, updatedAt: Date.now()};
  chrome.storage.local.set({postureState: state}).then(() => reply({ok: true}));
  return true;
});
chrome.runtime.onStartup.addListener(() => chrome.storage.local.set({postureState: idle}));
